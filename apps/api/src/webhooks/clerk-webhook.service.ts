import { Injectable, Logger } from "@nestjs/common";
import { Prisma, MembershipStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { clerkRoleToRole } from "../auth/clerk-auth.provider";

const SOURCE = "clerk";

// Minimal subset of the Clerk webhook event shapes we care about. Clerk's
// schema is large; typing only what we read keeps this file legible.
export type ClerkWebhookEvent =
  | {
      type: "user.created" | "user.updated";
      data: {
        id: string;
        email_addresses?: Array<{ id: string; email_address: string }>;
        primary_email_address_id?: string | null;
        first_name?: string | null;
        last_name?: string | null;
      };
    }
  | { type: "user.deleted"; data: { id: string; deleted?: boolean } }
  | {
      type: "organization.created" | "organization.updated";
      data: { id: string; name: string; slug: string | null };
    }
  | { type: "organization.deleted"; data: { id: string; deleted?: boolean } }
  | {
      type:
        | "organizationMembership.created"
        | "organizationMembership.updated";
      data: {
        organization: { id: string };
        public_user_data: { user_id: string };
        role: string;
      };
    }
  | {
      type: "organizationMembership.deleted";
      data: {
        organization: { id: string };
        public_user_data: { user_id: string };
      };
    }
  | {
      type: "organizationInvitation.created";
      data: {
        id: string;
        organization_id: string;
        email_address: string;
        role: string;
      };
    }
  | {
      type:
        | "organizationInvitation.accepted"
        | "organizationInvitation.revoked";
      data: { id: string; organization_id: string; email_address: string };
    };

/**
 * Mirrors Clerk state into our `users`, `salons`, and `salon_memberships`
 * tables. Each call is wrapped in a transaction that:
 *   1. Inserts a `processed_webhook_events` row keyed on (source, eventId).
 *   2. Performs the side effect.
 *
 * The unique constraint on (source, externalEventId) makes Clerk re-deliveries
 * a no-op — if the insert fails with P2002, we've already processed it.
 */
@Injectable()
export class ClerkWebhookService {
  private readonly logger = new Logger(ClerkWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(eventId: string, event: ClerkWebhookEvent): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.processedWebhookEvent.create({
          data: {
            source: SOURCE,
            externalEventId: eventId,
            eventType: event.type,
          },
        });
        await this.apply(tx, event);
      });
    } catch (err) {
      // Narrow to the idempotency-key uniqueness violation. A P2002 from
      // anywhere else inside `apply` is a real error and must propagate so
      // svix retries it — otherwise we'd silently drop genuine failures.
      if (isProcessedWebhookEventDuplicate(err)) {
        this.logger.log(`Clerk event ${eventId} already processed; skipping`);
        return;
      }
      throw err;
    }
  }

  private async apply(
    tx: Prisma.TransactionClient,
    event: ClerkWebhookEvent,
  ): Promise<void> {
    switch (event.type) {
      case "user.created":
      case "user.updated": {
        const { id, first_name, last_name } = event.data;
        const email = primaryEmail(event.data);
        const displayName =
          [first_name, last_name].filter((p): p is string => Boolean(p)).join(
            " ",
          ) || null;
        await tx.user.upsert({
          where: { clerkUserId: id },
          create: { clerkUserId: id, email, displayName },
          update: { email, displayName },
        });
        return;
      }

      case "user.deleted": {
        // We don't hard-delete users — rows may be referenced by historical
        // appointments. Strip the Clerk linkage so a re-created Clerk user
        // doesn't collide on the unique index.
        await tx.user.updateMany({
          where: { clerkUserId: event.data.id },
          data: { clerkUserId: null },
        });
        return;
      }

      case "organization.created":
      case "organization.updated": {
        const { id, name, slug } = event.data;
        const finalSlug = await uniqueSlug(tx, slug ?? id, id);
        await tx.salon.upsert({
          where: { clerkOrgId: id },
          create: { clerkOrgId: id, name, slug: finalSlug },
          update: { name, slug: finalSlug },
        });
        return;
      }

      case "organization.deleted": {
        // Soft-deactivate. Same reasoning as user.deleted — appointments,
        // payments, etc. depend on the salonId.
        await tx.salon.updateMany({
          where: { clerkOrgId: event.data.id },
          data: { isActive: false, clerkOrgId: null },
        });
        return;
      }

      case "organizationMembership.created":
      case "organizationMembership.updated": {
        const link = await resolveOrgUser(
          tx,
          event.data.organization.id,
          event.data.public_user_data.user_id,
        );
        if (!link) return;
        await tx.salonMembership.upsert({
          where: {
            salonId_userId: { salonId: link.salonId, userId: link.userId },
          },
          create: {
            salonId: link.salonId,
            userId: link.userId,
            role: clerkRoleToRole(event.data.role),
            status: MembershipStatus.ACTIVE,
          },
          update: {
            role: clerkRoleToRole(event.data.role),
            status: MembershipStatus.ACTIVE,
          },
        });
        return;
      }

      case "organizationMembership.deleted": {
        const link = await resolveOrgUser(
          tx,
          event.data.organization.id,
          event.data.public_user_data.user_id,
        );
        if (!link) return;
        await tx.salonMembership.updateMany({
          where: { salonId: link.salonId, userId: link.userId },
          data: { status: MembershipStatus.REMOVED },
        });
        return;
      }

      case "organizationInvitation.created": {
        const salon = await tx.salon.findUnique({
          where: { clerkOrgId: event.data.organization_id },
          select: { id: true },
        });
        if (!salon) return;
        // The invited user may not have a Clerk account yet, so we have no
        // Clerk user id to link on. Create a placeholder User keyed on email
        // and a SalonMembership in INVITED state. organization.membership.*
        // reconciles when the invite is accepted.
        const user = await tx.user.upsert({
          where: { email: event.data.email_address },
          create: { email: event.data.email_address },
          update: {},
        });
        await tx.salonMembership.upsert({
          where: { salonId_userId: { salonId: salon.id, userId: user.id } },
          create: {
            salonId: salon.id,
            userId: user.id,
            role: clerkRoleToRole(event.data.role),
            status: MembershipStatus.INVITED,
            invitedAt: new Date(),
          },
          update: {
            role: clerkRoleToRole(event.data.role),
            status: MembershipStatus.INVITED,
            invitedAt: new Date(),
          },
        });
        return;
      }

      case "organizationInvitation.accepted": {
        const salon = await tx.salon.findUnique({
          where: { clerkOrgId: event.data.organization_id },
          select: { id: true },
        });
        const user = await tx.user.findUnique({
          where: { email: event.data.email_address },
          select: { id: true },
        });
        if (!salon || !user) return;
        await tx.salonMembership.updateMany({
          where: { salonId: salon.id, userId: user.id },
          data: { status: MembershipStatus.ACTIVE },
        });
        return;
      }

      case "organizationInvitation.revoked": {
        const salon = await tx.salon.findUnique({
          where: { clerkOrgId: event.data.organization_id },
          select: { id: true },
        });
        const user = await tx.user.findUnique({
          where: { email: event.data.email_address },
          select: { id: true },
        });
        if (!salon || !user) return;
        await tx.salonMembership.updateMany({
          where: { salonId: salon.id, userId: user.id },
          data: { status: MembershipStatus.REMOVED },
        });
        return;
      }

      default: {
        const _exhaustive: never = event;
        this.logger.warn(
          `Unhandled Clerk event type: ${(_exhaustive as { type: string }).type}`,
        );
      }
    }
  }
}

function isProcessedWebhookEventDuplicate(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== "P2002") return false;
  // Prisma reports `target` as either an array of column names or the
  // constraint name string, depending on adapter version. Match either shape
  // against our (source, externalEventId) unique index.
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) {
    return target.includes("source") && target.includes("externalEventId");
  }
  if (typeof target === "string") {
    return target.includes("source") && target.includes("externalEventId");
  }
  return false;
}

function primaryEmail(data: {
  email_addresses?: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string | null;
}): string | null {
  if (!data.email_addresses?.length) return null;
  const primary = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id,
  );
  return (primary ?? data.email_addresses[0])?.email_address ?? null;
}

// Resolves a Clerk (orgId, userId) pair to our internal (salonId, userId).
// Returns null if either side hasn't been mirrored yet — the corresponding
// `organization.created` or `user.created` event will arrive shortly and the
// membership event will be redelivered.
async function resolveOrgUser(
  tx: Prisma.TransactionClient,
  clerkOrgId: string,
  clerkUserId: string,
): Promise<{ salonId: string; userId: string } | null> {
  const [salon, user] = await Promise.all([
    tx.salon.findUnique({
      where: { clerkOrgId },
      select: { id: true },
    }),
    tx.user.findUnique({
      where: { clerkUserId },
      select: { id: true },
    }),
  ]);
  if (!salon || !user) return null;
  return { salonId: salon.id, userId: user.id };
}

async function uniqueSlug(
  tx: Prisma.TransactionClient,
  base: string,
  clerkOrgId: string,
): Promise<string> {
  const candidate = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "salon";
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? candidate : `${candidate}-${i + 1}`;
    const taken = await tx.salon.findUnique({
      where: { slug },
      select: { clerkOrgId: true },
    });
    if (!taken || taken.clerkOrgId === clerkOrgId) return slug;
  }
  return `${candidate}-${Date.now()}`;
}


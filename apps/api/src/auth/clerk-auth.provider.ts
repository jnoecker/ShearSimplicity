import { Injectable, Logger } from "@nestjs/common";
import {
  createClerkClient,
  type AuthObject,
  type ClerkClient,
} from "@clerk/backend";
import type { Request } from "express";
import { MembershipStatus, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { env } from "../env";
import type { AuthIdentity } from "../context/request-context";
import type { AuthProvider } from "./auth-provider.interface";

/**
 * Verifies a Clerk session and translates `(clerkUserId, clerkOrgId)` into our
 * domain `AuthIdentity` by looking up — and, when missing, mirroring — the
 * corresponding `User` / `Salon` / `SalonMembership` rows.
 *
 * The Clerk webhook (Phase 1.5) is the canonical sync path for these rows.
 * The self-heal here is a backstop so first-sign-in or webhook lag never
 * surfaces as a 401: we log a warning and create the missing rows on the fly.
 *
 * Active org selection: when the Clerk session has no `orgId` (user hasn't
 * picked an org, or signed in to a personal account), `salonHint` is null —
 * `@SkipTenant()` routes still work, tenant-scoped routes return 403 via
 * the TenantGuard. That's the correct behavior.
 */
@Injectable()
export class ClerkAuthProvider implements AuthProvider {
  private readonly logger = new Logger(ClerkAuthProvider.name);
  private readonly clerk: ClerkClient | null;

  constructor(private readonly prisma: PrismaService) {
    this.clerk =
      env.AUTH_PROVIDER === "clerk" && env.CLERK_SECRET_KEY
        ? createClerkClient({
            secretKey: env.CLERK_SECRET_KEY,
            publishableKey: env.CLERK_PUBLISHABLE_KEY,
          })
        : null;
  }

  async authenticate(req: Request): Promise<AuthIdentity | null> {
    if (!this.clerk) {
      throw new Error(
        "ClerkAuthProvider selected but Clerk client is not configured",
      );
    }

    const fetchReq = expressToFetchRequest(req);
    const requestState = await this.clerk.authenticateRequest(fetchReq, {
      authorizedParties: [env.WEB_ORIGIN],
    });

    if (!requestState.isSignedIn) {
      return null;
    }

    const auth = requestState.toAuth();
    if (!auth.userId) {
      // toAuth() can still return a signed-out shape (e.g., pending session)
      // even when the request state was signed-in. Treat as unauthenticated.
      return null;
    }

    const user = await this.resolveUser(auth.userId);
    const salonHint = auth.orgId
      ? await this.resolveSalon(auth.orgId, user.id, auth.orgRole)
      : null;

    return {
      userId: user.id,
      email: user.email,
      salonHint: salonHint
        ? { salonId: salonHint.salonId, slug: salonHint.slug }
        : null,
    };
  }

  private async resolveUser(
    clerkUserId: string,
  ): Promise<{ id: string; email: string | null }> {
    const existing = await this.prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true, email: true },
    });
    if (existing) return existing;

    this.logger.warn(
      `Mirroring Clerk user ${clerkUserId} on demand — webhook may be lagging`,
    );
    const clerkUser = await this.clerk!.users.getUser(clerkUserId);
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? null;
    const displayName =
      [clerkUser.firstName, clerkUser.lastName]
        .filter((p): p is string => Boolean(p))
        .join(" ") || null;

    return this.prisma.user.upsert({
      where: { clerkUserId },
      create: { clerkUserId, email, displayName },
      update: {},
      select: { id: true, email: true },
    });
  }

  private async resolveSalon(
    clerkOrgId: string,
    userId: string,
    orgRole: AuthObject["orgRole"],
  ): Promise<{ salonId: string; slug: string } | null> {
    let salon = await this.prisma.salon.findUnique({
      where: { clerkOrgId },
      select: { id: true, slug: true, isActive: true },
    });

    if (!salon) {
      this.logger.warn(
        `Mirroring Clerk org ${clerkOrgId} on demand — webhook may be lagging`,
      );
      const org = await this.clerk!.organizations.getOrganization({
        organizationId: clerkOrgId,
      });
      const slug = await this.uniqueSalonSlug(org.slug ?? clerkOrgId);
      salon = await this.prisma.salon.upsert({
        where: { clerkOrgId },
        create: { clerkOrgId, name: org.name, slug },
        update: {},
        select: { id: true, slug: true, isActive: true },
      });
    }

    if (!salon.isActive) return null;

    await this.prisma.salonMembership.upsert({
      where: { salonId_userId: { salonId: salon.id, userId } },
      create: {
        salonId: salon.id,
        userId,
        role: clerkRoleToRole(orgRole),
        status: MembershipStatus.ACTIVE,
      },
      update: {},
    });

    return { salonId: salon.id, slug: salon.slug };
  }

  // Salon slugs are globally unique in our schema; Clerk org slugs are unique
  // within Clerk but might collide with existing rows. Append a short suffix
  // until we find a free one.
  private async uniqueSalonSlug(base: string): Promise<string> {
    const candidate = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    for (let i = 0; i < 5; i++) {
      const slug = i === 0 ? candidate : `${candidate}-${i + 1}`;
      const taken = await this.prisma.salon.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!taken) return slug;
    }
    return `${candidate}-${Date.now()}`;
  }
}

// Clerk's default org roles are `org:admin` and `org:member`. Custom roles can
// be defined in the Clerk dashboard; map them in this function as they appear.
export function clerkRoleToRole(orgRole: string | null | undefined): Role {
  switch (orgRole) {
    case "org:admin":
      return Role.OWNER;
    case "org:member":
      return Role.STYLIST;
    default:
      return Role.STYLIST;
  }
}

// Convert an Express request to a Fetch API Request so @clerk/backend can
// read the headers/cookies it needs. We don't forward the body (Clerk doesn't
// look at it for session verification).
export function expressToFetchRequest(req: Request): Request_ {
  const protocol = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
  const host = req.get("host") ?? "localhost";
  const url = `${protocol}://${host}${req.originalUrl}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(name, v);
    } else if (typeof value === "string") {
      headers.set(name, value);
    }
  }
  return new Request(url, { method: req.method, headers });
}

// Local alias to avoid colliding with the Express Request import.
type Request_ = globalThis.Request;

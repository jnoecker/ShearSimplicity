import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { MembershipStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PUBLIC_KEY } from "../auth/public.decorator";
import { SKIP_TENANT_KEY } from "./skip-tenant.decorator";
import type { ActiveSalon } from "../context/request-context";
import type { Role } from "@shearsimp/shared";

// RFC 4122 UUID, any version. Validated at the boundary so malformed
// values surface as a 400 rather than reaching Prisma and turning into a 500.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the active salon for the current request and verifies the
 * authenticated user actually has an ACTIVE membership in it.
 *
 * Resolution order:
 *  1. AuthIdentity.salonHint (set by AuthProvider) — most explicit.
 *  2. `x-salon-id` request header — useful for org-switcher UIs.
 *  3. (Future) Sole-membership fallback for users in exactly one salon.
 *
 * The user's role on that salon is what gets attached to req.salon, NOT
 * the role implied by the auth provider — the database is the source of
 * truth for authorization.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (skip) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const identity = req.identity;
    if (!identity) {
      throw new ForbiddenException("Tenant resolution requires authentication");
    }

    const salonId = this.resolveSalonId(req);
    if (!salonId) {
      throw new ForbiddenException("No active salon on request");
    }

    const membership = await this.prisma.salonMembership.findUnique({
      where: { salonId_userId: { salonId, userId: identity.userId } },
      include: { salon: { select: { slug: true, isActive: true } } },
    });

    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      !membership.salon.isActive
    ) {
      throw new ForbiddenException("No active membership in this salon");
    }

    const active: ActiveSalon = {
      salonId,
      slug: membership.salon.slug,
      role: membership.role as Role,
    };
    req.salon = active;
    return true;
  }

  private resolveSalonId(req: Request): string | null {
    const hint = req.identity?.salonHint?.salonId;
    if (hint) {
      // The hint comes from a verified auth source (cookie / Clerk session)
      // but we still validate to fail loudly if a future provider returns
      // a malformed value.
      if (!UUID_RE.test(hint)) {
        throw new BadRequestException("Invalid salon id from auth provider");
      }
      return hint;
    }

    const header = req.header("x-salon-id");
    if (typeof header === "string" && header.length > 0) {
      if (!UUID_RE.test(header)) {
        throw new BadRequestException("Invalid x-salon-id header");
      }
      return header;
    }

    return null;
  }
}

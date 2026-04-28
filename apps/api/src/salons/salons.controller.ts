import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { CurrentSalon } from "../tenant/current-salon.decorator";
import { SkipTenant } from "../tenant/skip-tenant.decorator";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ActiveSalon,
  AuthIdentity,
} from "../context/request-context";

@Controller("salons")
export class SalonsController {
  constructor(private readonly prisma: PrismaService) {}

  // Returns the salons the current user has any membership in. Used by
  // the web app's org switcher. Authenticated, but no active salon
  // required — that's what the user is choosing here.
  @SkipTenant()
  @Get("mine")
  async mine(@CurrentUser() user: AuthIdentity) {
    return this.prisma.salonMembership.findMany({
      where: { userId: user.userId, status: "ACTIVE" },
      include: { salon: { select: { id: true, slug: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  // Returns the active salon (resolved by TenantGuard).
  @Get("current")
  current(@CurrentSalon() salon: ActiveSalon): ActiveSalon {
    return salon;
  }
}

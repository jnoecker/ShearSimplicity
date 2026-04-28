import type { Request } from "express";
import type { Role } from "@shearsimp/shared";

export interface AuthIdentity {
  userId: string;
  email: string | null;
  // The salon the auth provider asserts is "active" for this request.
  // The TenantGuard validates the user actually has access to it before
  // attaching it to `req.salon`.
  salonHint: SalonHint | null;
}

export interface SalonHint {
  salonId: string;
  slug?: string;
}

export interface ActiveSalon {
  salonId: string;
  slug: string;
  role: Role;
}

// Augments the Express request with our auth + tenant context via the
// global Express namespace (the portable augmentation target — works
// regardless of how @types/express is hoisted in node_modules).
// Guards populate these in order: AuthGuard sets `identity`, TenantGuard
// sets `salon`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      identity?: AuthIdentity;
      salon?: ActiveSalon;
    }
  }
}

export type AuthedRequest = Request & {
  identity: AuthIdentity;
};

export type TenantedRequest = AuthedRequest & {
  salon: ActiveSalon;
};

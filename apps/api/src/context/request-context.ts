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

// Augments the Express request with our auth + tenant context. Guards
// populate these in order: AuthGuard sets `identity`, TenantGuard sets
// `salon`.
declare module "express-serve-static-core" {
  interface Request {
    identity?: AuthIdentity;
    salon?: ActiveSalon;
  }
}

export type AuthedRequest = Request & {
  identity: AuthIdentity;
};

export type TenantedRequest = AuthedRequest & {
  salon: ActiveSalon;
};

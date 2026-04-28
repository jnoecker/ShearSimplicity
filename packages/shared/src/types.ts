import type { Role } from "./enums.js";

export interface AuthIdentity {
  userId: string;
  email: string | null;
}

export interface ActiveSalon {
  salonId: string;
  slug: string;
  role: Role;
}

export interface RequestContext {
  identity: AuthIdentity;
  salon: ActiveSalon | null;
  correlationId: string;
}

export interface Money {
  amountCents: number;
  currency: string;
}

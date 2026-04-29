import type { Request } from "express";
import type { AuthIdentity } from "../context/request-context";

export const AUTH_PROVIDER = Symbol("AuthProvider");

/**
 * Pluggable identity resolution. Implementations:
 *  - DevAuthProvider: signed cookie set by the web app's dev sign-in route.
 *  - ClerkAuthProvider: verifies a Clerk session token (Phase 1.5).
 *
 * Returning null means "no identity" — the AuthGuard will reject the request
 * unless the route is decorated with @Public().
 */
export interface AuthProvider {
  authenticate(req: Request): Promise<AuthIdentity | null>;
}

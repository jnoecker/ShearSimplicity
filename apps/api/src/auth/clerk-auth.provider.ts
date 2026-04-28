import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { AuthIdentity } from "../context/request-context";
import type { AuthProvider } from "./auth-provider.interface";

/**
 * Phase 1.5 placeholder. The real implementation will verify the Clerk
 * session via `@clerk/backend`'s `authenticateRequest` / `verifyToken`,
 * and translate `clerkUserId` + `clerkOrgId` into an AuthIdentity by
 * looking them up in the `users` and `salons` tables.
 *
 * Selected when AUTH_PROVIDER=clerk; throws on first request to make the
 * gap obvious until implemented.
 */
@Injectable()
export class ClerkAuthProvider implements AuthProvider {
  async authenticate(_req: Request): Promise<AuthIdentity | null> {
    throw new Error(
      "ClerkAuthProvider is not implemented yet. Set AUTH_PROVIDER=dev or implement Phase 1.5.",
    );
  }
}

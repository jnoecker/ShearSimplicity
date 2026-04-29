import "server-only";
import { cookies } from "next/headers";
import { serverEnv } from "./env";
import {
  DEV_SESSION_COOKIE,
  type DevSessionPayload,
  verifyDevSession,
} from "./dev-session";

/**
 * Read the current dev session, if any. Returns null when the cookie is
 * missing or its signature doesn't verify.
 *
 * In Phase 1.5 this gets a sibling that reads the Clerk session and the
 * caller picks based on serverEnv.authProvider.
 */
export async function getServerSession(): Promise<DevSessionPayload | null> {
  if (serverEnv.authProvider !== "dev") return null;
  const store = await cookies();
  const raw = store.get(DEV_SESSION_COOKIE)?.value;
  if (!raw) return null;
  return verifyDevSession(raw, serverEnv.devAuthSecret);
}

import "server-only";
import { cookies } from "next/headers";
import { auth, currentUser } from "@clerk/nextjs/server";
import { serverEnv } from "./env";
import { DEV_SESSION_COOKIE, verifyDevSession } from "./dev-session";

/**
 * Display-shaped session for the app shell. Both providers normalize to
 * this shape so the (app) layout doesn't branch on auth mode.
 *
 * `salonSlug`/`salonName` are null when the user is signed in but hasn't
 * picked an organization yet — the layout can show an org picker in that
 * case.
 */
export interface AppSession {
  userId: string;
  email: string;
  salonName: string | null;
  salonSlug: string | null;
}

export async function getServerSession(): Promise<AppSession | null> {
  if (serverEnv.authProvider === "clerk") {
    return getClerkSession();
  }
  return getDevSession();
}

async function getDevSession(): Promise<AppSession | null> {
  const store = await cookies();
  const raw = store.get(DEV_SESSION_COOKIE)?.value;
  if (!raw) return null;
  const payload = verifyDevSession(raw, serverEnv.devAuthSecret);
  if (!payload) return null;
  return {
    userId: payload.userId,
    email: payload.email,
    salonName: "Acme Salon",
    salonSlug: payload.salonSlug,
  };
}

async function getClerkSession(): Promise<AppSession | null> {
  const { userId, orgSlug } = await auth();
  if (!userId) return null;
  // currentUser() round-trips to Clerk for the user record. Cheap enough
  // for the layout (cached per request); revisit if the dashboard takes
  // many auth-aware reads per page.
  // The Topbar renders Clerk's <OrganizationSwitcher /> in clerk mode,
  // which displays the active org name itself — we leave salonName null
  // and let the switcher handle it.
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  return {
    userId,
    email,
    salonName: null,
    salonSlug: orgSlug ?? null,
  };
}

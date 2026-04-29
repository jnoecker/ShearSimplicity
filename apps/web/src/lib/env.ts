import "server-only";

// Server-side env access. Throws on first access if a required value is
// missing — surfaces config errors at boot rather than at request time.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const authProvider = (process.env.AUTH_PROVIDER ?? "dev") as "dev" | "clerk";

function devValue(name: string, fallback: string): string {
  // Dev-only env vars aren't required when running in Clerk mode. We still
  // surface them as fixed strings so callers don't deal with optional types.
  return authProvider === "dev" ? required(name) : (process.env[name] ?? fallback);
}

export const serverEnv = {
  authProvider,
  devAuthSecret: devValue("DEV_AUTH_SECRET", "unused-in-clerk-mode"),
  devUserId: devValue("DEV_USER_ID", ""),
  devUserEmail: devValue("DEV_USER_EMAIL", ""),
  devSalonId: devValue("DEV_SALON_ID", ""),
  devSalonSlug: devValue("DEV_SALON_SLUG", ""),
  apiInternalUrl: process.env.API_INTERNAL_URL ?? "http://localhost:3001",
  // Required at boot when AUTH_PROVIDER=clerk; @clerk/nextjs reads them
  // directly from process.env so we mainly re-export for visibility.
  clerkPublishableKey:
    authProvider === "clerk"
      ? required("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
      : undefined,
  clerkSecretKey:
    authProvider === "clerk" ? required("CLERK_SECRET_KEY") : undefined,
};

export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
};

// Server-side env access. Throws on first access if a required value is
// missing — surfaces config errors at boot rather than at request time.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const serverEnv = {
  authProvider: (process.env.AUTH_PROVIDER ?? "dev") as "dev" | "clerk",
  devAuthSecret: required("DEV_AUTH_SECRET"),
  devUserId: required("DEV_USER_ID"),
  devUserEmail: required("DEV_USER_EMAIL"),
  devSalonId: required("DEV_SALON_ID"),
  devSalonSlug: required("DEV_SALON_SLUG"),
  apiInternalUrl:
    process.env.API_INTERNAL_URL ?? "http://localhost:3001",
};

export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
};

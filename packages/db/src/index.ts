import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

export type { PrismaClient } from "@prisma/client";

// Singleton — survives Next.js dev hot-reload and avoids exhausting Postgres
// connection limits during local development. Apps should import `prisma`
// rather than constructing their own client.
declare global {
  // eslint-disable-next-line no-var
  var __SHEARSIMP_PRISMA__: PrismaClient | undefined;
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["error", "warn"],
  });
}

export const prisma: PrismaClient =
  globalThis.__SHEARSIMP_PRISMA__ ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__SHEARSIMP_PRISMA__ = prisma;
}

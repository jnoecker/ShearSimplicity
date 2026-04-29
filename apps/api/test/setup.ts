// Vitest setup: ensure required env vars are present before any test file
// imports `env.ts` (which validates at module load).
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??=
  "postgresql://shearsimp:shearsimp_dev@localhost:5432/shearsimp?schema=public";
process.env.AUTH_PROVIDER ??= "dev";
process.env.DEV_AUTH_SECRET ??= "test-secret-12345";
process.env.DEV_USER_ID ??= "00000000-0000-0000-0000-000000000001";
process.env.DEV_USER_EMAIL ??= "dev@shearsimp.test";
process.env.DEV_SALON_ID ??= "00000000-0000-0000-0000-0000000000a1";
process.env.DEV_SALON_SLUG ??= "test-salon";
process.env.MESSAGING_PROVIDER ??= "dev";
process.env.TWILIO_FROM_NUMBER ??= "+15555550100";
process.env.PAYMENT_PROVIDER ??= "dev";

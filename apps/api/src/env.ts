import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(3001),
    WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),

    AUTH_PROVIDER: z.enum(["dev", "clerk"]).default("dev"),
    DEV_AUTH_SECRET: z.string().min(8).default("dev-secret-change-me"),
    DEV_USER_ID: z.string().uuid(),
    DEV_USER_EMAIL: z.string().email(),
    DEV_SALON_ID: z.string().uuid(),
    DEV_SALON_SLUG: z.string().min(1),

    // Disables the in-process outbox poller. Tests and one-off scripts set
    // this so the worker doesn't tick during their lifetime; production
    // leaves it unset.
    OUTBOX_WORKER_DISABLED: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),

    CLERK_SECRET_KEY: z.string().optional(),
    // Clerk issues a single publishable key per app. The web side reads it
    // from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (the prefix is required for
    // Next.js to expose it to the browser); the API reads the same value.
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
    CLERK_WEBHOOK_SECRET: z.string().optional(),

    // Phase 4a — messaging.
    MESSAGING_PROVIDER: z.enum(["dev", "twilio"]).default("dev"),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    // Single from-number for all salons in 4a. Per-salon numbers land in 4b
    // along with the salon-settings UI.
    TWILIO_FROM_NUMBER: z.string().optional(),
    // Public origin Twilio POSTs webhooks to (used to reconstruct the URL
    // for signature verification when behind a proxy that rewrites the host).
    // Optional: when unset we trust the request's own host header.
    TWILIO_WEBHOOK_PUBLIC_URL: z.string().url().optional(),

    // Phase 5a — payments.
    PAYMENT_PROVIDER: z.enum(["dev", "stripe"]).default("dev"),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_PROVIDER === "clerk") {
      for (const key of [
        "CLERK_SECRET_KEY",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        "CLERK_WEBHOOK_SECRET",
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when AUTH_PROVIDER=clerk`,
          });
        }
      }
    }

    if (env.MESSAGING_PROVIDER === "twilio") {
      for (const key of [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_FROM_NUMBER",
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when MESSAGING_PROVIDER=twilio`,
          });
        }
      }
    }

    if (env.PAYMENT_PROVIDER === "stripe") {
      for (const key of [
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when PAYMENT_PROVIDER=stripe`,
          });
        }
      }
    }
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:");
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment");
  }
  return parsed.data;
}

export const env: Env = loadEnv();

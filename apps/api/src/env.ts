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

    CLERK_SECRET_KEY: z.string().optional(),
    CLERK_PUBLISHABLE_KEY: z.string().optional(),
    CLERK_WEBHOOK_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_PROVIDER !== "clerk") return;
    for (const key of [
      "CLERK_SECRET_KEY",
      "CLERK_PUBLISHABLE_KEY",
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

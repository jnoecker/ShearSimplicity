# Deployment

ShearSimplicity runs on **Railway**. The same image artifacts deploy to two
separate Railway projects:

- **`app.shearscheduling.com`** — real salon. Live Stripe, live Clerk, real
  client data.
- **`demo.shearscheduling.com`** — recruiter-facing demo. Stripe test mode,
  seeded data, nightly reset cron (planned).

Each project has its own Postgres + Redis. The two never share infrastructure.

## Services per project

| Service | Image            | Public | Notes                                        |
|---------|------------------|--------|----------------------------------------------|
| `api`   | `apps/api/Dockerfile` | yes    | Nest HTTP API. `OUTBOX_WORKER_DISABLED=true`. |
| `worker`| `apps/api/Dockerfile` | no     | Outbox poller. Same image, worker enabled.    |
| `web`   | `apps/web/Dockerfile` | yes    | Next.js admin app, standalone output.         |
| `postgres` | Railway plugin     | no     | Postgres 16. Injects `DATABASE_URL` to `api`/`worker`. |
| `redis` | Railway plugin     | no     | Redis 7. Injects `REDIS_URL` (used once outbox migrates to BullMQ). |

The API and worker share `apps/api/Dockerfile`. They differ only in environment
variables — the API sets `OUTBOX_WORKER_DISABLED=true`, the worker leaves it
unset.

## Per-service Railway config

Three `railway.*.json` files at the repo root declare each service's build /
start. In the Railway dashboard, point each service at its config file via the
**Config-as-code Path** setting:

| Service | Config file              |
|---------|--------------------------|
| `api`   | `railway.api.json`       |
| `worker`| `railway.worker.json`    |
| `web`   | `railway.web.json`       |

The API config also runs `prisma migrate deploy` as a `preDeployCommand` so
schema changes apply once per deploy, before the new container takes traffic.
The worker doesn't need it (the API already migrated).

## Environment variables

Set per service in the Railway dashboard. `DATABASE_URL` and `REDIS_URL` are
injected automatically by the plugins — don't hand-paste them.

### `api` and `worker`

| Var                              | Value                                              |
|----------------------------------|----------------------------------------------------|
| `NODE_ENV`                       | `production`                                       |
| `API_PORT`                       | `3001` (Railway exposes via `PORT`; see note)      |
| `WEB_ORIGIN`                     | `https://app.shearscheduling.com`                  |
| `DATABASE_URL`                   | (injected)                                         |
| `AUTH_PROVIDER`                  | `clerk`                                            |
| `CLERK_SECRET_KEY`               | from Clerk dashboard → API Keys                    |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | from Clerk dashboard                            |
| `CLERK_WEBHOOK_SECRET`           | from Clerk dashboard → Webhooks → Signing Secret   |
| `MESSAGING_PROVIDER`             | `dev` until A2P 10DLC clears, then `twilio`        |
| `TWILIO_ACCOUNT_SID`             | from Twilio (when enabled)                         |
| `TWILIO_AUTH_TOKEN`              | from Twilio (when enabled)                         |
| `TWILIO_FROM_NUMBER`             | salon's E.164 number (when enabled)                |
| `TWILIO_WEBHOOK_PUBLIC_URL`      | `https://api.shearscheduling.com`                  |
| `PAYMENT_PROVIDER`               | `stripe`                                           |
| `STRIPE_SECRET_KEY`              | live key from Stripe dashboard                     |
| `STRIPE_WEBHOOK_SECRET`          | from Stripe → Developers → Webhooks → Signing      |
| `OUTBOX_WORKER_DISABLED`         | `api`: `true`. `worker`: leave unset.              |

### `web`

| Var                                  | Value                              |
|--------------------------------------|------------------------------------|
| `NODE_ENV`                           | `production`                       |
| `NEXT_PUBLIC_API_URL`                | `https://api.shearscheduling.com`  |
| `API_INTERNAL_URL`                   | (Railway internal: `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | from Clerk                         |
| `CLERK_SECRET_KEY`                   | from Clerk                         |

## DNS + custom domains

Cloudflare hosts DNS for `shearscheduling.com`. Each Railway service that
needs a public URL gets a custom domain in the Railway dashboard:

- `app.shearscheduling.com` → web service
- `api.shearscheduling.com` → api service

Railway generates a CNAME target; add it in Cloudflare with proxy disabled
(grey cloud) so Railway can issue its own TLS certificate.

## Webhook URLs

Once `api.shearscheduling.com` resolves and TLS is live:

- **Clerk** → `https://api.shearscheduling.com/webhooks/clerk`
  Use a fresh signing secret per environment.
- **Stripe** → `https://api.shearscheduling.com/webhooks/stripe`
  Subscribe to `checkout.session.completed`, `payment_intent.payment_failed`,
  `charge.refunded`. Fresh signing secret per environment.
- **Twilio** → `https://api.shearscheduling.com/webhooks/twilio/sms`
  Configured per number under Phone Numbers → your number → Messaging →
  *A message comes in*.

## First deploy

1. Create the Railway project, attach Postgres + Redis plugins.
2. Add the three services from the GitHub repo, set each one's config-as-code
   path per the table above.
3. Paste the env vars per service.
4. Trigger a deploy — Railway runs `prisma migrate deploy` before the API
   takes traffic.
5. Smoke test: `curl https://api.shearscheduling.com/health` should return
   `{ "status": "ok", "db": "up" }`.
6. Sign in via Clerk on `app.shearscheduling.com`, create the first salon,
   wire the webhooks above.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR to `main`:
typecheck, Prisma schema validate, all package tests. Railway watches the
`main` branch and auto-deploys on push.

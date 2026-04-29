# ShearSimplicity

Multi-tenant salon scheduling and POS SaaS. Phase 1 foundation.

## Stack

- **Runtime**: Node 22 LTS, pnpm workspaces
- **Backend**: NestJS 10 (Express), Prisma 6, PostgreSQL 16
- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS 4
- **Jobs**: BullMQ + Redis 7 *(scaffolded; not wired in Phase 1)*
- **Auth**: pluggable `AuthProvider` interface; `DevAuthProvider` ships now, `ClerkAuthProvider` lands in Phase 1.5
- **Payments / Messaging**: Stripe + Twilio adapters land in Phases 4–5

## Layout

```
apps/
  api/          NestJS backend
  web/          Next.js frontend
packages/
  db/           Prisma schema, client, migrations, seed
  shared/       Source-of-truth enums and DTOs (no db dependency)
docker-compose.yml   Postgres 16 + Redis 7 (with healthchecks)
```

## Getting started

```bash
# 1. Prereqs: Node 22+, pnpm 9+, Docker
cp .env.example .env

# 2. Install
pnpm install

# 3. Start infra
pnpm infra:up

# 4. Generate Prisma client + apply schema + seed dev fixtures
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 5. Run both apps
pnpm dev
```

- API: http://localhost:3001 (health: `/health`)
- Web: http://localhost:3000

## Dev auth

`AUTH_PROVIDER=dev` is the default. Visit `/sign-in` on the web app and click
**Sign in as dev user** — this hits a Next route handler that sets a signed
`__shearsimp_dev_session` cookie. The Nest API reads the same cookie to
resolve a fixed user + salon identity that matches the seeded fixture.

## Clerk setup (Phase 1.5)

Switch from the dev provider to real authentication via Clerk Organizations.
First-time Clerk users — every step is clickable.

1. **Create the Clerk app**
   - Sign in at <https://dashboard.clerk.com> and click **Create application**.
   - Give it a name (e.g. *ShearSimplicity Dev*), pick the sign-in methods you
     want (email + Google is a good default), then **Create application**.

2. **Enable Organizations**
   - In the dashboard sidebar: **Organizations Management** → toggle
     **Enable organizations**.
   - Under **Organization settings**, allow members to create their own
     organizations (so dev sign-up creates a salon for you).

3. **Copy API keys into `.env`**
   - Dashboard → **API Keys**. Copy the **Publishable key** and **Secret key**
     into your `.env`:
     ```
     AUTH_PROVIDER="clerk"
     NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
     CLERK_PUBLISHABLE_KEY="pk_test_..."
     CLERK_SECRET_KEY="sk_test_..."
     ```

4. **Wire the webhook (so orgs/users mirror into your DB)**
   - In dev, expose your local API to Clerk via either:
     - **Clerk CLI** — `npx @clerk/cli webhooks tunnel --port 3001` (recommended), or
     - **ngrok** — `ngrok http 3001` and use the forwarded HTTPS URL.
   - Dashboard → **Webhooks** → **Add endpoint**.
   - Endpoint URL: `<tunnel-url>/webhooks/clerk`.
   - Subscribe to:
     `user.created`, `user.updated`, `user.deleted`,
     `organization.created`, `organization.updated`, `organization.deleted`,
     `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`,
     `organizationInvitation.created`, `organizationInvitation.accepted`, `organizationInvitation.revoked`.
   - After creation, copy the **Signing Secret** into `.env` as
     `CLERK_WEBHOOK_SECRET="whsec_..."`.

5. **Restart `pnpm dev`**, sign up at <http://localhost:3000/sign-up>, create
   an organization, and the Topbar's **OrganizationSwitcher** lights up. The
   webhook will mirror your Clerk org into the `salons` table; if it lags, the
   `ClerkAuthProvider` self-heals on first request and logs a warning.

To swap back: set `AUTH_PROVIDER=dev` and restart — no other change needed.

## Tenant isolation

Two-layer defense:

1. **Schema-level** — every tenant-owned table carries `salonId`, with
   composite indexes (`[salonId, ...]`) and composite uniqueness so
   cross-tenant data can't accidentally collide. `appointment_services`
   stores price/duration/name snapshots so historical bookings don't drift
   when a service is edited.
2. **Request-level** — `AuthGuard` and `TenantGuard` are registered as
   global `APP_GUARD`s. Routes opt out with `@Public()` (no auth) or
   `@SkipTenant()` (auth without salon scope). Controllers read the
   active salon via `@CurrentSalon()`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run web + api in parallel |
| `pnpm build` | Build all workspaces |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm lint` | Lint all workspaces |
| `pnpm test` | Test all workspaces |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:validate` | Validate Prisma schema |
| `pnpm db:migrate` | Apply migrations (dev) |
| `pnpm db:seed` | Seed dev fixtures |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm infra:up` / `:down` / `:logs` | Manage Postgres + Redis |

## Status

Phase 1 (Foundation) — see commit history for what's wired up.
Future phases (CRUD, scheduling, SMS, payments, AI) land incrementally.

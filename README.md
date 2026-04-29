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

To swap to Clerk later: set `AUTH_PROVIDER=clerk`, supply Clerk keys, and the
`ClerkAuthProvider` (Phase 1.5) takes over without any controller changes.

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

# ShearSimplicity Roadmap

Phase-by-phase plan. Each phase ships as its own PR off `main`.
Edit this file as priorities shift — it's the source of truth for "what's next?".

## Status legend

- ✅ Complete — landed in `main`
- 🚧 In progress — open PR or active branch
- 🟡 Next up — planned for the next session
- ⬜ Future — scoped, not started

## Stack pins

Pinned deliberately. Don't drift these without a discussion.

| Layer       | Choice                                            |
|-------------|---------------------------------------------------|
| Runtime     | Node 22 LTS, pnpm 9 workspace                     |
| Backend     | NestJS 10 (Express) on TypeScript 5               |
| Frontend    | Next.js 15 (App Router) + React 19 + Tailwind 4   |
| Database    | PostgreSQL 16, Prisma 6.x                         |
| Jobs        | BullMQ + Redis 7                                  |
| Auth        | Pluggable `AuthProvider` (Dev → Clerk Orgs)       |
| Payments    | Stripe Checkout → Stripe Terminal                 |
| Messaging   | Twilio SMS (A2P 10DLC required for US production) |
| Voice       | Twilio Voice + OpenAI Realtime (later)            |

## Cross-cutting non-negotiables

These apply to every phase. Reviewers should reject PRs that violate them.

- **Tenant isolation, two layers**:
  - *Schema*: every tenant-scoped relation uses composite FKs `(id, salonId)` so cross-tenant links are impossible at the database level.
  - *Request*: global `AuthGuard` + `TenantGuard` registered as `APP_GUARD`s. Opt out with `@Public()` (no auth) or `@SkipTenant()` (auth without active salon). Controllers consume `@CurrentSalon()`.
- **Append-only event sourcing**: business writes append to `domain_events` and `outbox_events` in the same transaction. Outbox processing is asynchronous and retryable. Never delete from these tables.
- **Snapshot historical fields**: when a row records what was true at the time (e.g., `appointment_services.priceSnapshotCents`), don't recompute from the live parent — store the snapshot.
- **Idempotency at integration boundaries**: Stripe `idempotencyKey` per payment, Twilio `providerMessageId` unique, Clerk webhook event IDs deduplicated.
- **Avoid deleting business records.** Prefer status changes (`CANCELLED`, `INACTIVE`, etc.). FK actions favor `Restrict` over `SetNull` / `Cascade` for non-tenant deletes.

---

## Phase 1 — Foundation ✅

PR: [#1](https://github.com/jnoecker/ShearSimplicity/pull/1)

- pnpm workspace: `apps/api`, `apps/web`, `packages/db`, `packages/shared`
- Full Prisma schema with composite tenant FKs and snapshot fields
- `AuthProvider` interface + `DevAuthProvider` (signed cookie); `ClerkAuthProvider` stub
- Global `AuthGuard` + `TenantGuard`, `@Public()` / `@SkipTenant()` / `@CurrentSalon()`
- Next.js 15 admin shell: sidebar, topbar, 7 placeholder routes, dev sign-in flow
- Docker Compose for Postgres 16 + Redis 7 (healthchecks, named volumes)
- Enum parity test between `@shearsimp/shared` and Prisma
- `dotenv-cli` so Prisma scripts pick up the root `.env`

## Phase 1.5 — Clerk Organizations 🟡

Replace `DevAuthProvider` with a real auth flow without changing controllers.

- `@clerk/nextjs` middleware + `<ClerkProvider>` in `apps/web`
- Implement `ClerkAuthProvider` in `apps/api` using `@clerk/backend`'s `authenticateRequest` / `verifyToken`
- Org switcher topbar wired to `useOrganizationList()`
- Clerk webhook → mirror `User` and `Salon` rows (idempotent on Clerk event ID); link `clerkOrgId` and `clerkUserId` for lookup
- Invite flow → `SalonMembership` row with `MembershipStatus.INVITED`
- Sign-out + session expiry parity with the web cookie behavior
- E2E: dev mode and Clerk mode both pass the same test suite (toggle via `AUTH_PROVIDER`)

**Risks:** Clerk's Next SDK is intrusive; treat its boundary carefully so swap-back to dev mode stays cheap. Don't leak Clerk types into shared packages.

## Phase 2 — Core salon data ⬜

CRUD UIs and APIs for the entities the rest of the product depends on.

- Staff: profiles, working hours, color tags, role assignment, active toggle
- Services: categories, default duration, default price, slug uniqueness per salon, active toggle
- Clients: profiles, contact info (phone/email unique per salon), notes, search
- Appointment history rolls up on the client profile (read-only this phase)
- Form validation shared via Zod schemas in `@shearsimp/shared`
- All writes append `domain_events` (`client.created`, `service.created`, etc.) in the same transaction
- Settings: salon profile, timezone, business hours

**Definition of done:** can create a salon, add 3 stylists with hours, add 5 services in 2 categories, add 10 clients, all without touching the database directly.

## Phase 3 — Scheduling ⬜

Where the product earns its keep.

- Create / reschedule / cancel appointments with conflict detection (no overlap on same stylist)
- Status state machine: `SCHEDULED → CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED` (plus `CANCELLED`, `NO_SHOW`)
- On status change, append `appointment.*` domain events
- Calendar view: day, week, stylist column views; drag-to-reschedule
- Stylist availability respects `WorkingHours` and existing appointments
- Appointment notes (client-visible) and internal notes (staff only)
- Capture `actualStartAt` / `actualEndAt` / `actualDurationMinutes` on completion (Phase 6 will use these as ground truth)
- Outbox worker stub: process `appointment.created` events (no side effects yet — wired in Phase 4)

**Risks:** time zones. Store everything UTC; render in salon's `timezone`. DST edge cases at the salon-hour boundary.

## Phase 4 — Messaging (SMS) ⬜

Outbound first, inbound second. Reminder jobs separate from confirmations.

- Twilio adapter behind a `MessagingProvider` interface (mirror the auth pattern)
- Outbox worker: on `appointment.created` send confirmation SMS; idempotent on `Message.providerMessageId`
- Reminder jobs (BullMQ): scheduled at appointment creation, cancelled on reschedule/cancel
- Cancellation / reschedule deep links signed with short-lived tokens
- Inbound webhook (Twilio → API) logs to `messages` and appends `message.sms_received`
- Message history per client
- **A2P 10DLC compliance work** documented separately: brand registration, campaign approval. Without it, US carriers will filter or block.

**Risks:** Twilio webhook signature validation, replay protection. Long messages segmenting cost-of-delivery surprises.

## Phase 5 — Payments / POS (Stripe Checkout) ⬜

PCI exposure stays minimal — Stripe-hosted surfaces only this phase.

- Stripe adapter behind a `PaymentProvider` interface
- Create Checkout Session for an appointment; webhook updates `payments.status` (idempotent on Stripe event ID)
- Tip capture, receipt URL, refund tracking
- Appointment checkout state separate from appointment status (an appointment can be `COMPLETED` and `payments.status = PENDING`)
- Webhook signature validation + idempotency on Stripe `event.id`

**Out of scope (Phase 5.5):** Stripe Terminal, in-person card readers, product sales, inventory, taxes, gift cards/packages.

## Phase 6 — Heuristic duration prediction ⬜

Cold-start safe. No ML yet.

- Maturity ladder, evaluated in this order until a level has enough data:
  - L0: service default duration
  - L1: salon-wide average overrun
  - L2: stylist-wide adjustment
  - L3: service-specific adjustment
  - L4: stylist + service adjustment
  - L5: client-specific adjustment
- Persist every prediction to `duration_predictions` with `factors` JSON (which level fired, what samples it used)
- Compare against `actualDurationMinutes` (captured in Phase 3) to compute model accuracy
- UI surfaces "recommended block: 150 min · medium confidence" with a tooltip showing factors
- `ai.duration_estimate_generated`, `ai.recommendation_shown/accepted/rejected` events for future analytics

**Definition of done:** explainable recommendations on the booking screen with confidence labels; backtest dashboard showing prediction vs actual.

## Phase 7 — AI receptionist (text) ⬜

Text before voice. Tools, not freeform writes.

- Capabilities: "what openings does Maya have Friday?", "book me for a haircut after 3", "cancel my appointment tomorrow", "how much is balayage?"
- Confirm-before-write: any state-changing action requires explicit user confirmation in the UI before the tool fires
- Tool surface: search availability, search services, search appointments, propose booking (creates `SCHEDULED` only after confirmation), cancel/reschedule with policy checks
- Conversation history scoped to client+salon; events appended for audit

**Risks:** prompt injection from inbound SMS once that path connects. Don't let the agent read system prompts from message bodies.

## Phase 8 — AI receptionist (voice) ⬜

Twilio Voice + OpenAI Realtime. Same tools, narrower scope.

- Answer salon hours, basic FAQ, search availability, create *tentative* bookings (confirmation always via SMS — never silent commits)
- Hard escalation to human for: refunds, staff schedule changes, policy exceptions, anything the agent flags low-confidence on
- Call recordings + transcripts behind explicit consent settings per salon
- Per-salon voice/persona configuration

**Risks:** latency + interruption handling. PII in transcripts (client names, phone numbers) — encrypt at rest, scrubbing for logs.

---

## Backlog (unscheduled)

Things to remember but not commit to yet.

- Online booking widget (public-facing, no auth)
- Multi-location salons (one Clerk org → multiple physical salons)
- Staff payroll / commission reports
- Inventory + retail product sales
- Gift cards and prepaid packages
- Loyalty / repeat-client discounts
- Mobile app (React Native or PWA)
- Custom integrations (Google Calendar two-way sync)
- Multi-currency / multi-locale

## Working agreements

- One logical change per PR. New feature branch from `main` for each piece.
- Every PR runs: `pnpm typecheck`, `pnpm db:validate`, `pnpm --filter @shearsimp/db test`. Add Vitest as the suite grows.
- Schema changes ship with a migration (`pnpm db:migrate`). Don't leave the schema and the migration history out of sync.
- Reviewers check tenant isolation specifically — schema-level composite FKs are easy to forget on new tables.

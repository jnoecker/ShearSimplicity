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

## Phase 1.5 — Clerk Organizations ✅

Replace `DevAuthProvider` with a real auth flow without changing controllers.

- `@clerk/nextjs` middleware + conditional `<ClerkProvider>` in `apps/web`
- `ClerkAuthProvider` in `apps/api` via `@clerk/backend`'s `authenticateRequest`,
  with self-heal `User` / `Salon` mirroring on first sign-in
- Topbar wired to Clerk `<OrganizationSwitcher />` + `<UserButton />` in clerk mode
- Clerk webhook → mirrors `User` / `Salon` / `SalonMembership` (idempotent on
  Clerk event ID via shared `processed_webhook_events` table)
- Invitations → `SalonMembership` row with `MembershipStatus.INVITED`,
  flipped to `ACTIVE` on `organizationInvitation.accepted`
- Sign-in/sign-up routes catchall under `[[...sign-in]]` so Clerk owns its
  multi-step flow; dev mode still serves the cookie form at the same path
- Vitest parity test: both providers produce equivalent `AuthIdentity` shapes
  *(narrower than a full Playwright e2e — that's worth a future phase)*

**Risks:** Clerk's Next SDK is intrusive; treat its boundary carefully so swap-back to dev mode stays cheap. Don't leak Clerk types into shared packages.

## Phase 2 — Core salon data ✅

CRUD UIs and APIs for the entities the rest of the product depends on.

- Staff: profiles, working hours, color tags, role assignment, active toggle
- Services: categories, default duration, default price, slug uniqueness per salon, active toggle
- Clients: profiles, contact info (phone/email unique per salon), notes, search
- Appointment history rolls up on the client profile (read-only this phase)
- Form validation shared via Zod schemas in `@shearsimp/shared`
- All writes append `domain_events` (`client.created`, `service.created`, etc.) in the same transaction
- Settings: salon profile, timezone, business hours

**Definition of done:** can create a salon, add 3 stylists with hours, add 5 services in 2 categories, add 10 clients, all without touching the database directly.

## Phase 3 — Scheduling ✅

Where the product earns its keep. Shipped as five focused PRs.

### Phase 3a — Scheduling backend ✅

PR: [#6](https://github.com/jnoecker/ShearSimplicity/pull/6)

- Create / reschedule / cancel appointments with conflict detection (no overlap on same stylist)
- Status state machine: `SCHEDULED → CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED` (plus `CANCELLED`, `NO_SHOW`)
- On status change, append `appointment.*` domain events
- Appointment notes (client-visible) and internal notes (staff only)
- Capture `actualStartAt` / `actualEndAt` / `actualDurationMinutes` on completion (Phase 6 will use these as ground truth)
- Outbox worker stub: process `appointment.created` events (no side effects yet — wired in Phase 4)

### Phase 3b — Calendar UI ✅

PR: [#7](https://github.com/jnoecker/ShearSimplicity/pull/7)

- Day-view calendar with stylist columns + drag-to-reschedule
- Stylist availability respects `WorkingHours` and existing appointments
- 15-minute grid at 14px/slot; service-coded color blocks; per-stylist header tints
- Foundation for the design system (Cormorant + Quicksand + Great Vibes, Tresses palette)

### Phase 3c — Restyle dashboard + CRUD ✅

PR: [#8](https://github.com/jnoecker/ShearSimplicity/pull/8)

- Dashboard, Staff, Services, Clients, Settings, Messages all rebuilt against the design system

### Phase 3d — Sign-in + client profile hero ✅

PR: [#9](https://github.com/jnoecker/ShearSimplicity/pull/9)

- Sign-in card on the orb-blanket background; client profile hero with photo halo, mini-stats, history timeline

### Phase 3e — Booking flow ✅

PR: [#10](https://github.com/jnoecker/ShearSimplicity/pull/10)

- `/schedule/new` page with client picker, services multi-select, stylist tiles, and the month → day calendar with per-day color load bars
- Open-slot rendering gated by selected service duration

### Phase 3f — Booking modal ✅

The `/schedule/new` standalone page got rebuilt as a centered modal opened in-place
on `/schedule` (`?book=1` query state, so back/forward and shareable URLs work).

- Glass modal shell over the schedule, blurred orb backdrop, serif title
- Rich client picker (avatar + meta row, "Change" reveals an inline search popover)
- Services as a single-trigger dropdown — search, category-grouped, picks render back as colored tag chips
- Stylist 4-up cards
- Reuses the Phase 3e two-step calendar (month → day) inside the modal body
- `/schedule/new` redirects to `/schedule?book=1` so old links keep working

**Risks:** time zones. Store everything UTC; render in salon's `timezone`. DST edge cases at the salon-hour boundary.

## Phase 4 — Messaging (SMS) 🚧

Outbound first, inbound second. Reminder jobs separate from confirmations.

### Phase 4a — Messaging backend 🚧

- `MessagingProvider` interface, switchable on `MESSAGING_PROVIDER` env
  (`dev` logs and returns a fake sid; `twilio` uses the official SDK)
- Outbox worker now actually dispatches: `appointment.created` → confirmation SMS
- Idempotent on `Message.outboxEventId` (new schema column) so retries don't double-send
- Inbound webhook `POST /webhooks/twilio/sms` with HMAC signature validation,
  deduped on `processed_webhook_events.(source, externalEventId)`, routes
  inbound messages to the salon by sender phone (single-shared-number caveat — see 4b)
- Message body templated per appointment in the salon's timezone, includes STOP instruction
- Vitest coverage for the formatter + handler flow control (send / dedup / cancelled / no phone / send failure)

**Out of scope (intentional):** reminder scheduling, reschedule/cancel SMS, message-history UI, per-salon Twilio numbers, deep-link tokens. Those land in 4b.

### Phase 4b-1 — Reschedule + cancel notifications 🚧

- New outbox emissions in `appointments.service.ts` for reschedule + cancel
  (alongside the existing domain events)
- New handler methods on `SmsHandlersService` mirror `handleAppointmentCreated`,
  share the INSERT-then-send dedup helper, render bodies with old → new for
  reschedule and the cancelled time for cancel
- Outbox worker dispatch routes the two new event types
- Vitest coverage for fresh send, retry dedup, missing-payload skip,
  status-already-cancelled-on-reschedule skip, no-phone skip

### Phase 4b-2 — Reminder scheduling 🚧

- New event type `appointment.reminder_due`. Reuses `OutboxEvent.nextAttemptAt`
  for deferred dispatch (the worker's existing poll already filters on it,
  so no leasing/queue changes were needed).
- `create()` schedules with `nextAttemptAt = startAt - 24h`. Same-day
  bookings end up with a past `nextAttemptAt` and fire on the next tick,
  which is the correct behaviour.
- `reschedule()` does an `updateMany` to move the still-`PENDING` row
  forward/back; rows that already fired don't match (status moved past
  PENDING) and stay as-is — once a reminder went out for the old time, we
  can't unsend it.
- `cancel()` marks the still-`PENDING` row `COMPLETED` to suppress firing.
- Handler skips on CANCELLED / NO_SHOW / COMPLETED status (belt + suspenders
  for races) and on a startAt that's already past at fire time.

### Phase 4b-3 — Per-salon Twilio numbers 🚧

- New nullable, unique `Salon.smsFromNumber` (E.164) + settings UI field
- Outbound: handler reads `Salon.smsFromNumber` first, falls back to the
  env-level `TWILIO_FROM_NUMBER`, drops with a logged warning if neither
- Inbound: webhook routes by `To` header (`Salon.findUnique` on `smsFromNumber`)
  with a sender-phone fallback that keeps single-tenant dev working
- Shared zod validates E.164 format on PATCH; null clears the number

### Backlog (was 4b, deferred to 4c or beyond)

- Cancellation / reschedule deep links signed with short-lived tokens
- Message history per client (UI)
- BullMQ migration (only if we hit operational pain — outbox `nextAttemptAt`
  is good enough for 4b-2)

### A2P 10DLC compliance — separate workstream

- Brand registration, campaign approval. Without it, US carriers will filter or block.
- Terms / privacy policy live at `docs/sms-terms.md` and `docs/privacy-policy.md`.

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

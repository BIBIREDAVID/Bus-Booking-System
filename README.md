# BookMyBus — Interstate Bus Booking System

Monorepo (npm workspaces) with two packages:

- **`/web`** — React + Vite frontend, Tailwind, react-router
- **`/api`** — Express + TypeScript backend, Prisma + Postgres

## Prerequisites

- Node.js 20+

No Docker or local Postgres install needed — `/api` uses Prisma's
built-in local dev database (`npx prisma dev`), a zero-install Postgres
that runs entirely through the Prisma CLI.

## 1. Install dependencies

From the repo root (installs both workspaces):

```bash
npm install
```

## 2. Start the local database

In its own terminal, from `/api`:

```bash
cd api
npx prisma dev
```

Leave this running. It prints a few connection strings — copy the one
labeled **TCP** (looks like `postgres://postgres:postgres@localhost:<port>/template1?sslmode=disable`).
The port is assigned per run, so re-copy it if you restart `prisma dev`.

To keep a named, persistent instance across restarts instead of an
ephemeral one, use `npx prisma dev -n bookmybus -d` (detached) and
`npx prisma dev ls` to see its connection strings again later.

## 3. Configure environment variables

```bash
cp api/.env.example api/.env
cp web/.env.example web/.env
```

Paste the TCP connection string from step 2 into `api/.env`'s
`DATABASE_URL`.

## 4. Run database migrations

```bash
cd api
npx prisma migrate dev
```

This applies everything in `prisma/migrations` (including the
hand-added CHECK constraints noted in `prisma/schema.prisma`) and
generates the Prisma Client.

## 5. Seed reference data

A fresh database has no parks, routes, fares, buses, or admin account
— nothing to search or book yet. Seed the minimum needed to get going:

```bash
cd api
npx prisma db seed
```

This creates a 3-park route (Lagos → Ibadan → Benin) with fares for
every board/alight pair, a daily 6:30am schedule, one bus, one driver,
and an admin account. It's safe to run more than once — it checks for
existing data first rather than duplicating it.

By default the admin phone is `+2348000000001`; override it by setting
`SEED_ADMIN_PHONE` in `api/.env` before seeding. There's no real SMS
provider in dev, so the OTP code to log in as that admin prints to the
`npm run dev:api` terminal (once it's running — see the next step) as
a `[sendSms]` line rather than being texted.

Once you can log in as the seeded admin, open **Admin → Trips** and
assign the seeded bus to a generated trip — that's what actually
creates bookable seats (see "Trip generation" below for why). Trips
generate automatically on a nightly cron; to generate them immediately
instead of waiting:

```bash
npm run generate-trips
```

## 6. Run both apps

From the repo root, in two more terminals:

```bash
npm run dev:api   # http://localhost:4000
npm run dev:web   # http://localhost:5173
```

The web app's login screen pings `GET /health` on the API to confirm
connectivity.

## Inspecting the database

```bash
cd api
npx prisma studio
```

Opens a browser UI at `http://localhost:5555` for browsing/editing rows.

## Trip generation

Admins create **route schedules** (`/admin/schedules` — route + time of
day + days of week). A job expands active schedules into real `trips`
rows for a rolling 30-day window (see [api/src/jobs/generateTrips.ts](api/src/jobs/generateTrips.ts)).
It's idempotent — safe to run repeatedly, including overlapping windows.

- **While the API runs as a long-lived process** (`npm run dev:api` /
  `npm start`), it also runs this on a cron schedule in-process via
  `node-cron` (daily at 02:00 by default — see `TRIP_GENERATION_CRON`
  in `.env`). Set `ENABLE_CRON=false` to turn this off.
- **To run it manually, or from an external scheduler** (e.g. a
  Railway/host cron job instead of the in-process one above):
  ```bash
  cd api
  npm run generate-trips
  ```

Generated trips start with no bus/driver and 0 seats. An admin assigns
a bus via `/admin/trips`, which is also where `trip_seats` actually get
created — see the comment at the top of `generateTrips.ts` for why
seat generation is deferred to that step rather than done up front.

## Booking: search, seat holds, concurrency

`GET /search` resolves a route by finding boarding-enabled stops shared
by the origin/destination parks (in order) and returns scheduled trips
on that route for the given date. `GET /trips/:id/seat-map` and
`POST /bookings/hold` are segment-aware — a seat can be legitimately
booked more than once per trip across non-overlapping stop ranges (e.g.
A→B, then B→D), so availability is computed from stop order overlap,
not a flat seat-status flag (see the example query at the bottom of
[schema.sql](schema.sql)).

`POST /bookings/hold` is the one place in this codebase where two
concurrent requests genuinely race for the same resource. It uses
`SELECT ... FOR UPDATE` on the `trip_seats` row inside a transaction to
serialize check-then-insert per seat — see the doc comment on
[api/src/lib/holdSeat.ts](api/src/lib/holdSeat.ts) for the full
walkthrough of why that's airtight against overlapping-segment races.
[api/tests/holdSeat.test.ts](api/tests/holdSeat.test.ts) is an
integration test (real Postgres, real transactions — no mocking) that
fires two concurrent holds for overlapping segments of the same seat
and asserts exactly one succeeds; a companion test confirms two
concurrent *non*-overlapping segments both succeed. Run with:

```bash
cd api
npm test
```

Holds expire after 10 minutes; `api/src/jobs/purgeExpiredHolds.ts` (same
cron mechanism as trip generation — see `PURGE_HOLDS_CRON` in `.env`,
default every 5 minutes) deletes expired rows. This is a hygiene job,
not a correctness requirement — the hold/seat-map queries already
filter on `expires_at > now()` regardless.

## Checkout: wallet, gateway top-up, pay-at-park

Every checkout path starts from a `seat_holds` row (`POST /bookings/hold`)
and ends by creating a `bookings` row + deleting that hold, inside a
transaction that re-locks the seat and re-checks for overlap — see
[api/src/lib/bookingTransaction.ts](api/src/lib/bookingTransaction.ts).
Three ways to pay:

- **`POST /bookings/pay-with-wallet`** — synchronous: locks the wallet
  row (`FOR UPDATE`), debits it, creates the booking, all in one
  transaction. Fails with 402 if balance is insufficient.
- **`POST /bookings/top-up-and-pay`** — for a wallet shortfall. Computes
  the shortfall, stubs a gateway payment (`lib/paymentGateways.ts`,
  same pattern as `lib/sms.ts` — swap in a real Squad/Paystack API call
  later) and records a `payment_intents` row. The wallet is only
  credited, and the booking only created, once the webhook confirms
  payment — the frontend can never mark this paid itself.
- **`POST /bookings/pay-at-park`** — no payment gateway; creates the
  booking as `reserved_unpaid` with a cutoff 2 hours before departure.
  Rejected if requested inside that window.

`POST /payments/webhook/squad` and `/paystack` verify each gateway's
HMAC-SHA512 signature over the *raw* request body before trusting
anything in it (see the same file's doc comment — header names/exact
payload shapes are provider-specific, verify against your account's
actual webhook logs before going live). On a verified success event,
the wallet is credited first in its own transaction — the user's money
is never lost even if their original hold expired while they were on
the gateway's payment page — then booking creation is attempted with
that topped-up balance; idempotent against webhook retries via
`payment_intents.status`.

`api/src/jobs/cancelUnpaidBookings.ts` (same cron mechanism, see
`CANCEL_UNPAID_CRON`) cancels `reserved_unpaid` bookings past their
cutoff, freeing the seat.

**A real bug worth knowing about**: the booking transaction helpers
originally called `resolveSegment`/`resolveFare` (which read through
the plain, non-transactional `prisma` client) *from inside* the
`FOR UPDATE`-holding transaction. Real Postgres handles that fine, but
the local dev database (`prisma dev`'s embedded PGlite) doesn't
support a second connection querying while the first holds an open
transaction — it just stalls until the outer transaction's timeout.
Fixed by resolving everything through the plain client *before* opening
the transaction (matching the pattern `lib/holdSeat.ts` already used) —
also just better practice regardless, since it keeps the transaction
itself shorter.

### Simulating a gateway payment locally

There's no real Squad/Paystack account wired up, so the "Top up with
Squad/Paystack" checkout option can't get a real webhook callback.
`POST /bookings/simulate-payment` (dev-only — 404s if `NODE_ENV=production`)
runs the *exact* same confirmation logic the real webhook uses
([lib: `confirmPaymentIntentByReference`](api/src/routes/paymentsWebhook.ts)),
just without a signature to verify — it's a stand-in for "the gateway
just told us this reference succeeded," not a different code path. The
checkout screen surfaces this as a **"Simulate Payment Success (dev)"**
button once a top-up is initiated. To test the real webhook path
instead (e.g. to check signature verification), compute an HMAC-SHA512
of the raw JSON body with `PAYSTACK_SECRET_KEY`/`SQUAD_SECRET_KEY` from
`.env` and POST it to `/payments/webhook/paystack` (or `/squad`) with
that as the `x-paystack-signature` (or `x-squad-signature`) header.

## Wallet

`GET /wallet` returns the current balance (the denormalized cache
column) plus paginated transaction history, newest first. `POST /wallet/topup/initiate`
starts a standalone top-up (not tied to any booking) — it's the *same*
`payment_intents` → webhook → `confirmPaymentIntentByReference` pipeline
used by checkout's top-up-and-pay (see [api/src/routes/paymentsWebhook.ts](api/src/routes/paymentsWebhook.ts)),
just with no trip/seat context attached, so the webhook credits the
wallet and stops there instead of also trying to create a booking.
There's deliberately no second "mark this paid" endpoint — the only
way a wallet gets credited is through that one verified path.

`POST /admin/wallet/:userId/recompute` is a safety net, not a rider
feature: it sums every `wallet_transactions` row for a user and
overwrites `wallets.balance` with that total, correcting any drift
between the cache and the ledger (the ledger is always the source of
truth — see schema.sql's comment on the wallet tables).

## Schema

The Postgres schema is authored in [schema.sql](schema.sql) at the repo
root and translated into [api/prisma/schema.prisma](api/prisma/schema.prisma).
See the comment at the top of that file for the known gaps (CHECK
constraints aren't expressible in Prisma's schema language, and the
`pgcrypto` extension is omitted since `npx prisma dev` can't install
Postgres extensions and doesn't need it — `gen_random_uuid()` has been
built into Postgres core since v13).

If you later deploy against a real managed Postgres (Supabase, RDS,
etc. — anything v13+), the same migrations apply as-is; nothing here is
specific to `prisma dev`.

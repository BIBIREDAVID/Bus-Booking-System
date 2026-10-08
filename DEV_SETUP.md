# Dev Setup Guide

For another developer setting this project up on their own machine via GitHub
(for the client's PC, which has no GitHub access, use manual file copy instead —
see the note at the bottom).

Repo: https://github.com/BIBIREDAVID/Bus-Booking-System (branch `master`)

## 1. Prerequisites

- **Node.js 20+** and npm — check with `node -v`.
- **Git**.
- Nothing else. No Docker, no local Postgres install — the API uses Prisma's
  built-in local dev database (`npx prisma dev`), a zero-install Postgres that
  runs entirely through the Prisma CLI.

## 2. Clone and install

```bash
git clone https://github.com/BIBIREDAVID/Bus-Booking-System.git
cd Bus-Booking-System
npm install
```

This installs both workspaces (`/api` and `/web`) in one go via npm workspaces.

## 3. Start the local database

In its own terminal:

```bash
cd api
npx prisma dev -n bookmybus -d
```

This starts a **named, persistent** local Postgres instance (the `-d` detaches
it so it keeps running independently of this terminal). It prints a connection
string — copy the one labeled **TCP** (looks like
`postgres://postgres:postgres@localhost:<port>/template1?sslmode=disable`).

The port is assigned per machine, so use whatever it actually prints, not the
example above. To see the connection string again later without starting a new
instance: `npx prisma dev ls`.

## 4. Configure environment variables

```bash
cp api/.env.example api/.env
cp web/.env.example web/.env
```

Open `api/.env` and paste the TCP connection string from step 3 into
`DATABASE_URL`. Everything else in `.env.example` already has safe dev
defaults (dummy JWT secret, dummy payment-gateway secrets, cron schedules) —
no further edits needed to run locally.

## 5. Run database migrations

```bash
cd api
npx prisma migrate dev
```

This applies everything in `prisma/migrations` and generates the Prisma
Client. Run this again any time you pull new migration files.

## 6. Seed demo data

```bash
cd api
npx prisma db seed
```

Safe to re-run any time (it's idempotent for reference data and refreshes
demo bookings relative to *now*). This creates:

- 7 parks and 6 routes (not just one corridor) — see
  [DEMO_GUIDE.md](DEMO_GUIDE.md) for the full account list, route map and fares.
- An admin, two park-staff accounts, and three rider accounts, pre-loaded
  with bookings covering every status (upcoming, pay-at-park pending,
  checked-in, cancelled+refunded, completed+rated, completed+unrated).

There's no real SMS provider in dev — OTP codes print to the `npm run dev:api`
terminal as `[sendSms] ...` lines instead of being texted. Log in with any
phone number from DEMO_GUIDE.md and read the code from that terminal.

## 7. Run both apps

From the repo root, in two more terminals:

```bash
npm run dev:api   # http://localhost:4000
npm run dev:web   # http://localhost:5173
```

Open the web app URL printed by the second command. The login screen pings
`GET /health` on the API to confirm connectivity — if that fails, check the
API terminal for errors and that `DATABASE_URL` in `api/.env` matches the
port `prisma dev` is actually running on.

## 8. Run the tests (optional but recommended before pushing)

```bash
cd api
npm test
```

Integration tests run against the real local Postgres database (no mocking),
including a concurrency test that fires two simultaneous seat-hold requests.
Occasionally a single test may time out under load on a slow machine — if
only one fails, re-run just that file (`npx vitest run tests/<file>.test.ts`)
before assuming something's actually broken.

## Troubleshooting

**"Can't reach database server at localhost:<port>"** — the local Postgres
instance (`prisma dev`) has stopped or crashed. Restart it:
```bash
cd api
npx prisma dev -n bookmybus -d
```
If that errors with "Lock file is already being held" but nothing is actually
running, delete the stale lock and retry:
```bash
rm "$LOCALAPPDATA/prisma-dev-nodejs/Data/durable-streams/bookmybus/server.lock" 2>/dev/null
npx prisma dev -n bookmybus -d
```
Data survives restarts as long as you use the same `-n <name>`.

**Port 5173 already taken by something else** — Vite will automatically try
5174, 5175, etc. and print whichever one it actually bound. If that happens,
also update `WEB_ORIGIN` in `api/.env` to match (the API's CORS check is
origin-specific), then restart `npm run dev:api`.

**Changed `api/.env` but nothing happened** — `npm run dev:api` doesn't
hot-reload environment variables. Stop it (`Ctrl+C`) and start it again.

## For the client's PC (no GitHub access)

Don't use `git clone` there. Instead, zip the whole project folder (excluding
`node_modules` and any `.env` files) on a machine that has it, transfer the
zip over, then follow steps 2 onward above starting from `npm install` —
everything else is identical. See `DEMO_GUIDE.md` for what to show once it's
running.

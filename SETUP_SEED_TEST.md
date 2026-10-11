# Fresh Setup, Seeding & Test Guide

One checklist from "empty folder" to "confirmed working" — for setting this
project up on a new machine, seeding it, and verifying it actually runs.
Pair this with [DEMO_GUIDE.md](DEMO_GUIDE.md) (account list, routes, fares)
and [DEV_SETUP.md](DEV_SETUP.md) (full install detail + troubleshooting) for
more depth on any one step.

Run each step in order. Don't skip ahead — most failures later in this list
trace back to a skipped or out-of-order step earlier in it.

## Part 1 — Fresh Setup

- [ ] **Node.js 20+ installed.** Check: `node -v`
- [ ] **Project copied onto the machine** — either `git clone` (if this
      machine has GitHub access) or the extracted project folder (if sent
      manually, e.g. the client's PC). Either way, confirm you see `api/`,
      `web/`, `package.json` and this file at the top level.
- [ ] **Dependencies installed** — from the project root:
      ```bash
      npm install
      ```
      This installs both `api/` and `web/` in one go (npm workspaces). Wait
      for it to finish with no red error text.
- [ ] **Local database started** — in its own terminal, from `api/`:
      ```bash
      npx prisma dev -n bookmybus -d
      ```
      Copy the printed **TCP** connection string
      (`postgres://postgres:postgres@localhost:<port>/template1?sslmode=disable`).
      Leave this running — it's a background database process, not a step
      that finishes.
- [ ] **Environment files created:**
      ```bash
      cp api/.env.example api/.env
      cp web/.env.example web/.env
      ```
      Open `api/.env` and paste the TCP connection string from the previous
      step into `DATABASE_URL`. Nothing else needs editing to run locally.
- [ ] **Migrations applied:**
      ```bash
      cd api
      npx prisma migrate dev
      ```
      This creates every table and generates the Prisma Client. It should
      end by saying the database is now in sync with the schema.

**Part 1 is done when:** `npx prisma migrate dev` finishes with no errors.

## Part 2 — Seeding

- [ ] **Run the seed** (from `api/`):
      ```bash
      npx prisma db seed
      ```
- [ ] **Confirm the output ends with a block like this** (exact numbers may
      vary slightly, but the shape should match):
      ```
      Seed complete.
        Parks:   Ojota Park, Challenge Park, Benin Park, Utako Park, Waterlines Park, Sabon Gari Park, Holy Ghost Park
        Routes:  Lagos→Ibadan→Benin, Lagos→Abuja, Lagos→Benin→Port Harcourt, Ibadan→Abuja, Lagos→Kano, Benin→Enugu
        Buses:   ABC-101-XY / DEF-303-ST (standard), ABC-202-LX / DEF-404-LX (luxury), GHI-505-VP (vip)
        Drivers: Chinedu Okafor (has login), Amaka Nwosu, Bashir Suleiman, Funke Adeyemi, Emeka Nnadi
        Admin:   admin@bookmybus.dev
        Staff:   staff.lagos@bookmybus.dev (home park: Ojota Park), staff.abuja@bookmybus.dev (home park: Utako Park)
        Driver:  driver.chinedu@bookmybus.dev
        Riders:  aisha@bookmybus.dev (Aisha), tunde@bookmybus.dev (Tunde), ngozi@bookmybus.dev (Ngozi) — ₦50,000 wallet each
        Trips:   ...browsable upcoming trip(s) across 6 routes, plus 6 demo trips covering every booking status

      All accounts share one password: Passw0rd!
      ```
- [ ] **No red error text**, and specifically no `PrismaClientKnownRequestError`
      or `Can't reach database server` — that means the database from Part 1
      isn't actually running (see Troubleshooting below).
- [ ] **(Optional) Run it a second time** to confirm it's safe to repeat —
      routes should now say `already exists — skipped stops/fares/schedule`
      instead of `Created route ...`, and the demo trips still get recreated
      relative to now.

**Part 2 is done when:** the seed finishes with that summary block, with no
errors, and running it twice in a row both times ends cleanly.

## Part 3 — Test

### 3a. Automated tests

```bash
cd api
npm test
```

- [ ] Expect `46 passed` (or similarly all-passing — the count may grow over
      time as more tests are added).
- [ ] If exactly **one** test fails with a *timeout* (not a logic/assertion
      error), it's usually the local dev database being slow under load, not
      a real break. Re-run just that file to confirm:
      ```bash
      npx vitest run tests/<the failing file>.test.ts
      ```
      If it passes clean on its own, that's expected flakiness — not a bug.
      If the same test fails twice in a row, or more than one test fails,
      that's a real problem — report the exact output.

### 3b. Manual walkthrough (confirms the whole stack, not just the API)

Start both apps, each in its own terminal from the project root:
```bash
npm run dev:api   # http://localhost:4000
npm run dev:web   # http://localhost:5173
```

- [ ] Open the web app URL printed by the second command. You should land on
      a role-picker/login screen, not an error page.
- [ ] Choose **Rider**, sign in with `aisha@bookmybus.dev` / `Passw0rd!`.
- [ ] Confirm you land on **Home** and see an **Available Rides** list with
      real trips (not an empty list or an error) — this confirms the DB
      connection, seeding, and the API↔web link all work end to end.
- [ ] Log out, choose **Park Staff**, sign in with `staff.lagos@bookmybus.dev`
      / `Passw0rd!` — confirm the **Park Staff Dashboard** loads with a
      Manifest and Pending Payments.
- [ ] Log out, choose **Driver**, sign in with `driver.chinedu@bookmybus.dev`
      / `Passw0rd!` — confirm **My Trips** loads with assigned trips.
- [ ] Log out, choose **Admin**, sign in with `admin@bookmybus.dev` /
      `Passw0rd!` — confirm the **Admin Dashboard** loads with Reports
      showing real numbers (not stuck on "Loading..."), and that **Routes**
      and **Fleet & Drivers** show real data, not empty placeholders.

**Part 3 is done when:** the test suite passes (see 3a) and you can log in
as all four roles and see real data (see 3b).

## Troubleshooting

**`Can't reach database server at localhost:<port>`** — the local Postgres
from Part 1 isn't running (it may have crashed, or you closed its terminal).
Restart it:
```bash
cd api
npx prisma dev -n bookmybus -d
```
If that errors with "Lock file is already being held" but nothing is
actually running, delete the stale lock first:
```bash
rm "$LOCALAPPDATA/prisma-dev-nodejs/Data/durable-streams/bookmybus/server.lock"
npx prisma dev -n bookmybus -d
```

**Seed fails with a syntax error pointing at `seed.ts`** — the file got
corrupted in transfer (common if it was pasted as text somewhere instead of
sent as an actual file — special characters like `₦` and `→` break that).
Get a fresh copy of the file/folder and don't paste code through chat apps.

**Login says "Internal Server Error" or Home never loads data** — almost
always the same root cause as the first item above: check the API terminal
for a Prisma connection error.

**Changed `api/.env` but nothing changed** — `npm run dev:api` doesn't
hot-reload environment variables. Stop it (`Ctrl+C`) and start it again.

**Port 5173 already taken** — Vite will print whichever port it actually
bound (likely 5174). If so, also update `WEB_ORIGIN` in `api/.env` to match
and restart `npm run dev:api` — otherwise the browser will fail with a CORS
error on login.

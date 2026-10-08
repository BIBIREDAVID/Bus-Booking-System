# Demo Guide

This file is the single source of truth for what the seed script (`api/prisma/seed.ts`)
creates. Keep this file and `seed.ts` in sync — if you change one, update the other.
Copy this file alongside the project to any machine (including the client's PC) so
everyone is looking at the same demo data, instead of relying on memory or the
terminal scrollback from whoever ran the seed last.

Run the seed any time (safe to re-run before every demo — it resets demo data to be
relative to *now*):

```bash
cd api
npx prisma db seed
```

## Accounts (all logins are OTP-only — no passwords)

In dev, OTP codes are not texted anywhere — they print to the API terminal as
`[sendSms] ...`. Watch that terminal when logging in.

| Role | Name | Phone |
|---|---|---|
| Admin | Admin | `+2348000000001` (override with `SEED_ADMIN_PHONE` env var) |
| Park Staff | Counter Staff | `+2348033330001` (home park: Ojota Park, Lagos) |
| Park Staff | Abuja Counter Staff | `+2348033330002` (home park: Utako Park, Abuja) |
| Rider | Aisha Bello | `+2348022220001` |
| Rider | Tunde Alabi | `+2348022220002` |
| Rider | Ngozi Eze | `+2348022220003` |

All three riders start with a ₦50,000 wallet balance every time the seed runs. Each
also gets 1–2 saved passengers (for the "book for someone else" flow).

## Parks (7)

Ojota Park (Lagos), Challenge Park (Ibadan), Benin Park (Benin City), Utako Park
(Abuja), Waterlines Park (Port Harcourt), Sabon Gari Park (Kano), Holy Ghost Park
(Enugu).

## Routes (6) and fleet

| Route | Stops | Daily departure | Fare (standard / luxury / vip) |
|---|---|---|---|
| Lagos → Ibadan → Benin (flagship) | 3 | 06:30 | ₦8,000 / ₦11,000 / ₦14,000 (full route) |
| Lagos → Abuja | 2 | 07:00 | ₦12,000 / ₦16,000 / ₦20,000 |
| Lagos → Benin → Port Harcourt | 3 | 08:00 | ₦11,500 / ₦16,000 / ₦20,500 (full route) |
| Ibadan → Abuja | 2 | 06:00 | ₦9,000 / ₦13,000 / ₦16,000 |
| Lagos → Kano | 2 | 20:00 (overnight) | ₦15,000 / ₦20,000 / ₦25,000 |
| Benin → Enugu | 2 | 09:00 | ₦3,000 / ₦4,500 / ₦6,000 |

Every route has fares for every valid (board, alight) pair, not just the full route
— e.g. Lagos → Ibadan alone is ₦4,500/₦6,500/₦8,500 on the flagship route.

Fleet: 5 buses across all 3 classes (`ABC-101-XY`, `DEF-303-ST` standard;
`ABC-202-LX`, `DEF-404-LX` luxury; `GHI-505-VP` vip) and 5 drivers, distributed
across the 6 routes. The seed auto-assigns a bus+driver to several upcoming trips
per route (7 on the flagship route, 4 on each of the other five) so Search/Home
shows real browsable rides on every corridor immediately — no manual admin step
needed for those. Trips beyond that still need a bus assigned manually in Admin >
Trips.

## The 6 demo trips (flagship route only, recreated relative to "now" every seed run)

| # | Offset from now | Status | Who booked | What it demonstrates |
|---|---|---|---|---|
| 1 | +72h | scheduled | Aisha (wallet) | Cancel **with** refund (>24h out) |
| 2 | +10h | scheduled | Aisha (wallet) | Cancel **without** refund (<24h out); also has a "delay" trip alert |
| 3 | +48h | scheduled | Tunde, booked by Staff | Pay-at-park — shows in Staff > Pending Payments |
| 4 | +6h | scheduled | Ngozi (boarded), Aisha (not boarded) | Staff > Check-in / Manifest |
| 5 | +96h | cancelled + refunded | Aisha (wallet) | Rider > History (past cancellation) |
| 6 | -48h | completed | Aisha (rated 5★), Ngozi (unrated) | Rider > History; logging in as Ngozi shows the "rate your trip" prompt on Home |

Plus one route-wide "holiday_notice" trip alert.

## Other seeded sample data

- **Complaints**: 1 open (driver conduct, Aisha), 1 in review (vehicle condition,
  Tunde), 1 resolved with notes (Ngozi)
- **Lost & Found**: 1 lost item reported by Aisha, 2 found items logged by staff
  (one still open, one claimed)
- **Support tickets**: 1 open (payment, Aisha), 1 resolved (booking, Tunde), 1 open
  (technical, Ngozi)

## Quick demo script

1. Log in as **Aisha** (`+2348022220001`) → Home shows available rides + History
   has a cancel-with-refund and a cancel-without-refund example ready to try live.
2. Log in as **Ngozi** (`+2348022220003`) → Home shows the "rate your trip" prompt.
3. Log in as **Counter Staff** (`+2348033330001`) → Pending Payments shows Tunde's
   pay-at-park booking; Check-in shows trip #4's manifest.
4. Log in as **Admin** (`+2348000000001`) → Reports, trip alerts, complaint/ticket
   resolution, and six routes' worth of trips/fleet to manage.
5. Search **Lagos → Kano** or **Benin → Enugu** (or any other seeded pair) to show
   the network isn't just one corridor.

## New-PC setup

See `README.md` for full install steps. In short: install Node.js, clone/copy the
project, `npm install` in both `api/` and `web/`, run `npx prisma dev -n bookmybus -d`
to start the local Postgres, `npx prisma migrate deploy` + `npx prisma generate`,
then `npx prisma db seed` (this script) before starting `npm run dev` in both `api/`
and `web/`.

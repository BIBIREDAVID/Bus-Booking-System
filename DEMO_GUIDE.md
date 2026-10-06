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
| Rider | Aisha Bello | `+2348022220001` |
| Rider | Tunde Alabi | `+2348022220002` |
| Rider | Ngozi Eze | `+2348022220003` |

All three riders start with a ₦50,000 wallet balance every time the seed runs.

## Route and fleet

- Route: **Ojota Park (Lagos) → Challenge Park (Ibadan) → Benin Park (Benin City)**
- Daily departure at 06:30 (nightly job auto-generates real trips ~30 days out)
- Buses: `ABC-101-XY` (standard, 32 seats), `ABC-202-LX` (luxury, 20 seats)
- Drivers: Chinedu Okafor (standard bus), Amaka Nwosu (luxury bus)
- Fares (Lagos → Benin, full route): ₦8,000 standard / ₦11,000 luxury / ₦14,000 VIP
- The seed auto-assigns a bus+driver to the next 7 scheduled trips so Search/Home
  shows real browsable rides immediately — no manual admin step needed for those.
  Any trip beyond those 7 still needs a bus assigned manually in Admin > Trips.

## The 6 demo trips (recreated relative to "now" every seed run)

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
   resolution.

## New-PC setup

See `README.md` for full install steps. In short: install Node.js, clone/copy the
project, `npm install` in both `api/` and `web/`, run `npx prisma dev -n bookmybus -d`
to start the local Postgres, `npx prisma migrate deploy` + `npx prisma generate`,
then `npx prisma db seed` (this script) before starting `npm run dev` in both `api/`
and `web/`.

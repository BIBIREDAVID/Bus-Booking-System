-- ============================================================
-- Interstate Bus Booking App — PostgreSQL Schema
-- ============================================================
-- Notes:
-- - Written for PostgreSQL (works as-is on Supabase, RDS, etc).
-- - Seat availability is SEGMENT-AWARE: the same physical seat can be
--   booked multiple times on one trip across non-overlapping segments
--   (e.g. Park A->B, then resold B->D). Overlap is computed from
--   route_stops.stop_order, not a flat seat status flag — see the
--   comment above bookings and the example query at the bottom.
-- - Money columns use NUMERIC to avoid floating point rounding issues.
-- - All FKs use UUIDs; swap to BIGSERIAL if you prefer integer PKs.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('rider', 'park_staff', 'admin');
CREATE TYPE seat_class AS ENUM ('standard', 'luxury', 'vip');
CREATE TYPE bus_status AS ENUM ('active', 'maintenance');
CREATE TYPE driver_status AS ENUM ('active', 'inactive');
CREATE TYPE trip_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE booking_status AS ENUM ('held', 'reserved_unpaid', 'booked', 'cancelled', 'completed');
CREATE TYPE payment_method AS ENUM ('wallet', 'squad', 'paystack', 'pay_at_park');
CREATE TYPE wallet_txn_type AS ENUM ('fund', 'debit', 'refund');
CREATE TYPE alert_type AS ENUM ('delay', 'route_change', 'cancellation', 'holiday_notice');
CREATE TYPE complaint_status AS ENUM ('open', 'in_review', 'resolved');
CREATE TYPE lost_found_type AS ENUM ('lost', 'found');
CREATE TYPE lost_found_status AS ENUM ('open', 'claimed', 'closed');
CREATE TYPE support_category AS ENUM ('payment', 'booking', 'technical', 'other');
CREATE TYPE support_status AS ENUM ('open', 'resolved');
CREATE TYPE stop_alert_status AS ENUM ('active', 'fired', 'cancelled');

-- ------------------------------------------------------------
-- CORE REFERENCE DATA
-- ------------------------------------------------------------

CREATE TABLE parks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    address     TEXT,
    city        TEXT NOT NULL,
    state       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE buses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate       TEXT NOT NULL UNIQUE,
    capacity    INTEGER NOT NULL CHECK (capacity > 0),
    class       seat_class NOT NULL,
    status      bus_status NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE drivers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL UNIQUE,
    license_no  TEXT NOT NULL UNIQUE,
    status      driver_status NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- USERS / AUTH
-- ------------------------------------------------------------

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT,
    phone               TEXT NOT NULL UNIQUE,
    email               TEXT,
    role                user_role NOT NULL DEFAULT 'rider',
    home_park_id        UUID REFERENCES parks(id), -- park_staff only
    preferred_language  TEXT DEFAULT 'en',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT staff_has_home_park CHECK (
        role <> 'park_staff' OR home_park_id IS NOT NULL
    )
);

CREATE TABLE saved_passengers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    phone       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- ROUTES, STOPS, SEGMENTS
-- ------------------------------------------------------------

CREATE TABLE routes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_park_id  UUID NOT NULL REFERENCES parks(id),
    dest_park_id    UUID NOT NULL REFERENCES parks(id),
    duration_mins   INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every stop on a route, in travel order, including origin (order 1)
-- and destination (order N). isBoardingPoint marks whether riders can
-- actually board/alight there (false = rest stop only).
CREATE TABLE route_stops (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id            UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    park_id             UUID NOT NULL REFERENCES parks(id),
    stop_order          INTEGER NOT NULL,
    arrival_offset_mins INTEGER,   -- minutes from trip departure
    departure_offset_mins INTEGER,
    is_boarding_point   BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (route_id, stop_order)
);

-- One row per valid bookable segment (every ordered pair of
-- boarding-enabled stops on a route), with per-class fares.
CREATE TABLE route_segments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id        UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    from_stop_id    UUID NOT NULL REFERENCES route_stops(id),
    to_stop_id      UUID NOT NULL REFERENCES route_stops(id),
    fare_standard   NUMERIC(10,2) NOT NULL,
    fare_luxury     NUMERIC(10,2) NOT NULL,
    fare_vip        NUMERIC(10,2) NOT NULL,
    UNIQUE (route_id, from_stop_id, to_stop_id)
);

-- ------------------------------------------------------------
-- SCHEDULES & TRIPS
-- ------------------------------------------------------------

-- Recurring departure template an admin sets per route (e.g. daily
-- 06:00/12:00/18:00). A scheduled job expands this into real trips.
CREATE TABLE route_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id        UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    departure_time  TIME NOT NULL,      -- time of day
    days_of_week    SMALLINT[] NOT NULL, -- 0=Sun..6=Sat
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trips (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id        UUID NOT NULL REFERENCES routes(id),
    bus_id          UUID REFERENCES buses(id),
    driver_id       UUID REFERENCES drivers(id),
    departure_time  TIMESTAMPTZ NOT NULL,
    status          trip_status NOT NULL DEFAULT 'scheduled',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (route_id, departure_time)
);

CREATE TABLE trip_seats (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    seat_number TEXT NOT NULL,
    class       seat_class NOT NULL,
    UNIQUE (trip_id, seat_number)
);

-- Live GPS position, one row per trip, upserted while a trip is active.
-- Unused until the live-tracking phase ships; kept here so the schema
-- doesn't need to change later.
CREATE TABLE trip_locations (
    trip_id     UUID PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
    lat         DOUBLE PRECISION,
    lng         DOUBLE PRECISION,
    updated_at  TIMESTAMPTZ
);

CREATE TABLE trip_alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     UUID REFERENCES trips(id) ON DELETE CASCADE, -- nullable: route-wide alerts
    route_id    UUID REFERENCES routes(id) ON DELETE CASCADE,
    type        alert_type NOT NULL,
    message     TEXT NOT NULL,
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- SEAT HOLDS & BOOKINGS (segment-aware)
-- ------------------------------------------------------------

-- Short-lived hold while a rider is mid-checkout. Expired holds are
-- purged by a scheduled job; a seat is only truly unavailable once a
-- booking (not just a hold) exists for an overlapping segment.
CREATE TABLE seat_holds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID NOT NULL REFERENCES trips(id),
    seat_id         UUID NOT NULL REFERENCES trip_seats(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    board_stop_id   UUID NOT NULL REFERENCES route_stops(id),
    alight_stop_id  UUID NOT NULL REFERENCES route_stops(id),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_seat_holds_seat_trip ON seat_holds(trip_id, seat_id);
CREATE INDEX idx_seat_holds_expiry ON seat_holds(expires_at);

CREATE TABLE bookings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    trip_id         UUID NOT NULL REFERENCES trips(id),
    seat_id         UUID NOT NULL REFERENCES trip_seats(id),
    board_stop_id   UUID NOT NULL REFERENCES route_stops(id),
    alight_stop_id  UUID NOT NULL REFERENCES route_stops(id),
    class           seat_class NOT NULL,
    payment_method  payment_method NOT NULL,
    amount          NUMERIC(10,2) NOT NULL,
    status          booking_status NOT NULL DEFAULT 'held',
    performed_by    UUID REFERENCES users(id), -- set when staff create a manual booking
    pay_at_park_cutoff TIMESTAMPTZ,             -- only set for pay_at_park bookings
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_seat_trip ON bookings(trip_id, seat_id);
CREATE INDEX idx_bookings_user ON bookings(user_id);

-- Segment overlap rule (enforce in application/transaction logic, and
-- optionally as a CHECK via a trigger): two bookings on the SAME seat
-- and SAME trip conflict if
--   existing.board_stop_order < new.alight_stop_order
--   AND existing.alight_stop_order > new.board_stop_order
-- i.e. their [board, alight) ranges overlap on route_stops.stop_order.
-- See the example query at the bottom of this file.

CREATE TABLE booking_ratings (
    booking_id  UUID PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
    stars       SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- WALLET (ledger is source of truth; balance is a cache)
-- ------------------------------------------------------------

CREATE TABLE wallets (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance     NUMERIC(10,2) NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_transactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    type        wallet_txn_type NOT NULL,
    amount      NUMERIC(10,2) NOT NULL,
    booking_id  UUID REFERENCES bookings(id), -- nullable: not every txn ties to a booking
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_txns_user ON wallet_transactions(user_id, created_at);

-- ------------------------------------------------------------
-- STOP ALERTS (Phase 3, live-tracking dependent)
-- ------------------------------------------------------------

CREATE TABLE stop_alerts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trip_id             UUID NOT NULL REFERENCES trips(id),
    target_park_id      UUID NOT NULL REFERENCES parks(id),
    notify_mins_before  INTEGER NOT NULL,
    status              stop_alert_status NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- SUPPORT: COMPLAINTS, LOST & FOUND, TICKETS
-- ------------------------------------------------------------

CREATE TABLE complaints (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    trip_id     UUID REFERENCES trips(id),
    category    TEXT NOT NULL,
    message     TEXT NOT NULL,
    status      complaint_status NOT NULL DEFAULT 'open',
    assigned_to UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE lost_found_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type          lost_found_type NOT NULL,
    trip_id       UUID REFERENCES trips(id),
    description   TEXT NOT NULL,
    contact_info  TEXT,
    submitted_by  UUID REFERENCES users(id),
    home_park_id  UUID REFERENCES parks(id),
    status        lost_found_status NOT NULL DEFAULT 'open',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE support_tickets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    category    support_category NOT NULL,
    message     TEXT NOT NULL,
    status      support_status NOT NULL DEFAULT 'open',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- EXAMPLE: check seat availability for a segment (board -> alight)
-- ============================================================
-- Returns seats on a trip that are FREE for the requested segment,
-- i.e. no existing booking or live hold on that seat overlaps the
-- requested [board_order, alight_order) range.
--
-- :trip_id, :board_stop_order, :alight_stop_order are query params.

-- SELECT ts.*
-- FROM trip_seats ts
-- WHERE ts.trip_id = :trip_id
--   AND NOT EXISTS (
--     SELECT 1 FROM bookings b
--     JOIN route_stops bs ON bs.id = b.board_stop_id
--     JOIN route_stops as_ ON as_.id = b.alight_stop_id
--     WHERE b.trip_id = ts.trip_id
--       AND b.seat_id = ts.id
--       AND b.status IN ('booked', 'reserved_unpaid')
--       AND bs.stop_order < :alight_stop_order
--       AND as_.stop_order > :board_stop_order
--   )
--   AND NOT EXISTS (
--     SELECT 1 FROM seat_holds sh
--     JOIN route_stops hbs ON hbs.id = sh.board_stop_id
--     JOIN route_stops has_ ON has_.id = sh.alight_stop_id
--     WHERE sh.trip_id = ts.trip_id
--       AND sh.seat_id = ts.id
--       AND sh.expires_at > now()
--       AND hbs.stop_order < :alight_stop_order
--       AND has_.stop_order > :board_stop_order
--   );

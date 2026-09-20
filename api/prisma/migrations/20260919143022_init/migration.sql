-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('rider', 'park_staff', 'admin');

-- CreateEnum
CREATE TYPE "seat_class" AS ENUM ('standard', 'luxury', 'vip');

-- CreateEnum
CREATE TYPE "bus_status" AS ENUM ('active', 'maintenance');

-- CreateEnum
CREATE TYPE "driver_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "trip_status" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('held', 'reserved_unpaid', 'booked', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('wallet', 'squad', 'paystack', 'pay_at_park');

-- CreateEnum
CREATE TYPE "wallet_txn_type" AS ENUM ('fund', 'debit', 'refund');

-- CreateEnum
CREATE TYPE "alert_type" AS ENUM ('delay', 'route_change', 'cancellation', 'holiday_notice');

-- CreateEnum
CREATE TYPE "complaint_status" AS ENUM ('open', 'in_review', 'resolved');

-- CreateEnum
CREATE TYPE "lost_found_type" AS ENUM ('lost', 'found');

-- CreateEnum
CREATE TYPE "lost_found_status" AS ENUM ('open', 'claimed', 'closed');

-- CreateEnum
CREATE TYPE "support_category" AS ENUM ('payment', 'booking', 'technical', 'other');

-- CreateEnum
CREATE TYPE "support_status" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "stop_alert_status" AS ENUM ('active', 'fired', 'cancelled');

-- CreateTable
CREATE TABLE "parks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plate" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "class" "seat_class" NOT NULL,
    "status" "bus_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "license_no" TEXT NOT NULL,
    "status" "driver_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "role" "user_role" NOT NULL DEFAULT 'rider',
    "home_park_id" UUID,
    "preferred_language" TEXT DEFAULT 'en',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_passengers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "origin_park_id" UUID NOT NULL,
    "dest_park_id" UUID NOT NULL,
    "duration_mins" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "stop_order" INTEGER NOT NULL,
    "arrival_offset_mins" INTEGER,
    "departure_offset_mins" INTEGER,
    "is_boarding_point" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_id" UUID NOT NULL,
    "from_stop_id" UUID NOT NULL,
    "to_stop_id" UUID NOT NULL,
    "fare_standard" DECIMAL(10,2) NOT NULL,
    "fare_luxury" DECIMAL(10,2) NOT NULL,
    "fare_vip" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "route_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_id" UUID NOT NULL,
    "departure_time" TIME NOT NULL,
    "days_of_week" SMALLINT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_id" UUID NOT NULL,
    "bus_id" UUID,
    "driver_id" UUID,
    "departure_time" TIMESTAMPTZ NOT NULL,
    "status" "trip_status" NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_seats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID NOT NULL,
    "seat_number" TEXT NOT NULL,
    "class" "seat_class" NOT NULL,

    CONSTRAINT "trip_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_locations" (
    "trip_id" UUID NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "trip_locations_pkey" PRIMARY KEY ("trip_id")
);

-- CreateTable
CREATE TABLE "trip_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID,
    "route_id" UUID,
    "type" "alert_type" NOT NULL,
    "message" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_holds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID NOT NULL,
    "seat_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "board_stop_id" UUID NOT NULL,
    "alight_stop_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seat_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "seat_id" UUID NOT NULL,
    "board_stop_id" UUID NOT NULL,
    "alight_stop_id" UUID NOT NULL,
    "class" "seat_class" NOT NULL,
    "payment_method" "payment_method" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'held',
    "performed_by" UUID,
    "pay_at_park_cutoff" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_ratings" (
    "booking_id" UUID NOT NULL,
    "stars" SMALLINT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_ratings_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "user_id" UUID NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "wallet_txn_type" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "booking_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stop_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "target_park_id" UUID NOT NULL,
    "notify_mins_before" INTEGER NOT NULL,
    "status" "stop_alert_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stop_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "trip_id" UUID,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "complaint_status" NOT NULL DEFAULT 'open',
    "assigned_to" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lost_found_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "lost_found_type" NOT NULL,
    "trip_id" UUID,
    "description" TEXT NOT NULL,
    "contact_info" TEXT,
    "submitted_by" UUID,
    "home_park_id" UUID,
    "status" "lost_found_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lost_found_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "category" "support_category" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "support_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buses_plate_key" ON "buses"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_phone_key" ON "drivers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_license_no_key" ON "drivers"("license_no");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_route_id_stop_order_key" ON "route_stops"("route_id", "stop_order");

-- CreateIndex
CREATE UNIQUE INDEX "route_segments_route_id_from_stop_id_to_stop_id_key" ON "route_segments"("route_id", "from_stop_id", "to_stop_id");

-- CreateIndex
CREATE UNIQUE INDEX "trips_route_id_departure_time_key" ON "trips"("route_id", "departure_time");

-- CreateIndex
CREATE UNIQUE INDEX "trip_seats_trip_id_seat_number_key" ON "trip_seats"("trip_id", "seat_number");

-- CreateIndex
CREATE INDEX "idx_seat_holds_seat_trip" ON "seat_holds"("trip_id", "seat_id");

-- CreateIndex
CREATE INDEX "idx_seat_holds_expiry" ON "seat_holds"("expires_at");

-- CreateIndex
CREATE INDEX "idx_bookings_seat_trip" ON "bookings"("trip_id", "seat_id");

-- CreateIndex
CREATE INDEX "idx_bookings_user" ON "bookings"("user_id");

-- CreateIndex
CREATE INDEX "idx_wallet_txns_user" ON "wallet_transactions"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_home_park_id_fkey" FOREIGN KEY ("home_park_id") REFERENCES "parks"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_passengers" ADD CONSTRAINT "saved_passengers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_origin_park_id_fkey" FOREIGN KEY ("origin_park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_dest_park_id_fkey" FOREIGN KEY ("dest_park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_segments" ADD CONSTRAINT "route_segments_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_segments" ADD CONSTRAINT "route_segments_from_stop_id_fkey" FOREIGN KEY ("from_stop_id") REFERENCES "route_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_segments" ADD CONSTRAINT "route_segments_to_stop_id_fkey" FOREIGN KEY ("to_stop_id") REFERENCES "route_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_schedules" ADD CONSTRAINT "route_schedules_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_seats" ADD CONSTRAINT "trip_seats_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_locations" ADD CONSTRAINT "trip_locations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_alerts" ADD CONSTRAINT "trip_alerts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_alerts" ADD CONSTRAINT "trip_alerts_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_alerts" ADD CONSTRAINT "trip_alerts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_holds" ADD CONSTRAINT "seat_holds_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_holds" ADD CONSTRAINT "seat_holds_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "trip_seats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_holds" ADD CONSTRAINT "seat_holds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_holds" ADD CONSTRAINT "seat_holds_board_stop_id_fkey" FOREIGN KEY ("board_stop_id") REFERENCES "route_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_holds" ADD CONSTRAINT "seat_holds_alight_stop_id_fkey" FOREIGN KEY ("alight_stop_id") REFERENCES "route_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "trip_seats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_board_stop_id_fkey" FOREIGN KEY ("board_stop_id") REFERENCES "route_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_alight_stop_id_fkey" FOREIGN KEY ("alight_stop_id") REFERENCES "route_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_ratings" ADD CONSTRAINT "booking_ratings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stop_alerts" ADD CONSTRAINT "stop_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stop_alerts" ADD CONSTRAINT "stop_alerts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stop_alerts" ADD CONSTRAINT "stop_alerts_target_park_id_fkey" FOREIGN KEY ("target_park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_found_items" ADD CONSTRAINT "lost_found_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_found_items" ADD CONSTRAINT "lost_found_items_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_found_items" ADD CONSTRAINT "lost_found_items_home_park_id_fkey" FOREIGN KEY ("home_park_id") REFERENCES "parks"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

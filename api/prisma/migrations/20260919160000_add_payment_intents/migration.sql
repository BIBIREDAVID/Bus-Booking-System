-- CreateEnum
CREATE TYPE "payment_gateway_provider" AS ENUM ('squad', 'paystack');

-- CreateEnum
CREATE TYPE "payment_intent_status" AS ENUM ('pending', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" "payment_gateway_provider" NOT NULL,
    "provider_reference" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "payment_intent_status" NOT NULL DEFAULT 'pending',
    "hold_id" UUID,
    "trip_id" UUID NOT NULL,
    "seat_id" UUID NOT NULL,
    "board_stop_id" UUID NOT NULL,
    "alight_stop_id" UUID NOT NULL,
    "booking_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_provider_reference_key" ON "payment_intents"("provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_booking_id_key" ON "payment_intents"("booking_id");

-- CreateIndex
CREATE INDEX "idx_payment_intents_user" ON "payment_intents"("user_id");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

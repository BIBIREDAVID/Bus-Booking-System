-- AlterTable
ALTER TABLE "payment_intents" ALTER COLUMN "trip_id" DROP NOT NULL;
ALTER TABLE "payment_intents" ALTER COLUMN "seat_id" DROP NOT NULL;
ALTER TABLE "payment_intents" ALTER COLUMN "board_stop_id" DROP NOT NULL;
ALTER TABLE "payment_intents" ALTER COLUMN "alight_stop_id" DROP NOT NULL;

-- Switches login from phone+OTP to email+password across all roles,
-- adds the 'driver' role, and links drivers (fleet reference data) to
-- an optional login account. Written as safe ALTERs with backfills
-- rather than a destructive drop/recreate, so it applies cleanly even
-- against a database that already has rows.

-- 1. Add 'driver' to the role enum.
ALTER TYPE "user_role" ADD VALUE 'driver';

-- 2. users.email becomes the login credential: backfill any existing
-- NULL from phone (so old rows stay unique/non-null), then enforce.
UPDATE "users" SET "email" = COALESCE("email", "phone" || '@placeholder.bookmybus.local') WHERE "email" IS NULL;
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_email_key" UNIQUE ("email");

-- 3. users.password_hash — new required column. Existing rows (from
-- the old OTP-only world) get a placeholder bcrypt hash; real demo
-- accounts get a real one via the seed script re-run after this.
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
UPDATE "users" SET "password_hash" = '$2b$10$PG5tk00BwW4lXTeFYoEUt.uhOamL70PNrBjnhgA2Iblzb7PTYWlwW' WHERE "password_hash" IS NULL;
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;

-- 4. phone is now optional contact info, not the login credential.
-- The unique constraint on it stays (still useful for SMS/contact
-- lookups), just no longer NOT NULL.
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;

-- 5. drivers.user_id — nullable link to an optional login account.
-- A Driver row is fleet/reference data on its own; this is only set
-- once an admin explicitly creates a login for that person.
ALTER TABLE "drivers" ADD COLUMN "user_id" UUID;
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_key" UNIQUE ("user_id");
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. OTP is fully removed — drop the table.
DROP TABLE IF EXISTS "otp_codes";

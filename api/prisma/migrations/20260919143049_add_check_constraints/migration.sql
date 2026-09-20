-- CheckConstraint (hand-written: Prisma schema language cannot express
-- arbitrary CHECK constraints, so these three are applied directly here
-- to match schema.sql exactly)
ALTER TABLE "buses" ADD CONSTRAINT "buses_capacity_check" CHECK ("capacity" > 0);

ALTER TABLE "booking_ratings" ADD CONSTRAINT "booking_ratings_stars_check" CHECK ("stars" BETWEEN 1 AND 5);

ALTER TABLE "users" ADD CONSTRAINT "staff_has_home_park" CHECK ("role" <> 'park_staff' OR "home_park_id" IS NOT NULL);

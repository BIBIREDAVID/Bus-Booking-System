import 'dotenv/config'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

const WINDOW_DAYS = Number(process.env.TRIP_GENERATION_WINDOW_DAYS ?? 30)

/**
 * For each active route_schedule, ensures a trip row exists for every
 * matching day in the next WINDOW_DAYS days (today inclusive).
 *
 * Idempotent by design: each (route, departureTime) pair is inserted
 * against the existing @@unique([routeId, departureTime]) constraint;
 * a duplicate insert is caught and treated as "already exists", so
 * running this daily (or re-running it manually) never creates
 * duplicate trips.
 *
 * Deliberately does NOT create trip_seats here. A bus has a single
 * `class` and fixed `capacity` (see prisma/schema.prisma), which are
 * exactly what a trip's seats need — so seats can only be generated
 * correctly once a bus is known. Since route_schedules has no bus
 * assigned (a schedule is route + time-of-day, reusable across many
 * physical buses over time), trips come out of this job bus-less, and
 * an admin assigns a bus via POST /admin/trips/:id/assign, which is
 * where trip_seats actually get generated (see routes/adminTrips.ts).
 */
export async function generateUpcomingTrips(referenceDate: Date = new Date()) {
  const schedules = await prisma.routeSchedule.findMany({ where: { active: true } })

  let created = 0
  let skipped = 0

  for (const schedule of schedules) {
    const departureHours = schedule.departureTime.getUTCHours()
    const departureMinutes = schedule.departureTime.getUTCMinutes()
    const daysOfWeek = new Set(schedule.daysOfWeek)

    for (let offset = 0; offset < WINDOW_DAYS; offset++) {
      const date = new Date(
        Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate() + offset),
      )
      if (!daysOfWeek.has(date.getUTCDay())) continue

      const departureTime = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), departureHours, departureMinutes),
      )

      try {
        await prisma.trip.create({
          data: { routeId: schedule.routeId, departureTime, status: 'scheduled' },
        })
        created++
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          skipped++ // trip for this route + departure time already exists
        } else {
          throw err
        }
      }
    }
  }

  console.log(`[generateUpcomingTrips] processed ${schedules.length} active schedule(s): ~${created} created, ~${skipped} already existed`)
  return { schedulesProcessed: schedules.length, created, skipped }
}

// Allows this to be invoked directly by an external scheduler, e.g.
// a Railway cron job running `node dist/jobs/generateTrips.js`.
if (require.main === module) {
  generateUpcomingTrips()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[generateUpcomingTrips] failed', err)
      return prisma.$disconnect().finally(() => process.exit(1))
    })
}

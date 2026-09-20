import 'dotenv/config'
import { prisma } from '../lib/prisma'

/**
 * Flips a trip to 'completed' once it has actually finished — departure
 * time plus the route's scheduled duration has passed — and completes
 * every 'booked' booking on it (a booking still 'reserved_unpaid' at
 * this point was already auto-cancelled well before departure by
 * cancelUnpaidBookings.ts, so there's nothing to flip there). Booking
 * status 'completed' is what makes a trip eligible for the post-trip
 * rating prompt (see POST /bookings/:id/rating).
 */
export async function completeTrips() {
  const trips = await prisma.trip.findMany({
    where: { status: { in: ['scheduled', 'in_progress'] } },
    include: { route: { select: { durationMins: true } } },
  })

  const now = Date.now()
  const dueTripIds = trips
    .filter((t) => t.departureTime.getTime() + t.route.durationMins * 60_000 < now)
    .map((t) => t.id)

  if (dueTripIds.length === 0) {
    console.log('[completeTrips] no trips due for completion')
    return 0
  }

  await prisma.$transaction([
    prisma.trip.updateMany({ where: { id: { in: dueTripIds } }, data: { status: 'completed' } }),
    prisma.booking.updateMany({
      where: { tripId: { in: dueTripIds }, status: 'booked' },
      data: { status: 'completed' },
    }),
  ])

  console.log(`[completeTrips] completed ${dueTripIds.length} trip(s)`)
  return dueTripIds.length
}

if (require.main === module) {
  completeTrips()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[completeTrips] failed', err)
      return prisma.$disconnect().finally(() => process.exit(1))
    })
}

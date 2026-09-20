import { prisma } from './prisma'
import { NotFoundError, ForbiddenError } from './segments'

/**
 * Loads a trip and enforces that it departs from the given park
 * (route.originParkId === homeParkId) — the shared scoping rule behind
 * every park-staff endpoint (manual booking, pending payments,
 * check-in, manifest). Staff requesting another park's trip get a 403,
 * not a silently-filtered empty result — this is the actual
 * authorization boundary, not just a UI-level filter.
 */
export async function requireTripAtHomePark(tripId: string, homeParkId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { route: { include: { originPark: true, destPark: true } }, bus: true },
  })
  if (!trip) throw new NotFoundError('Trip not found')
  if (trip.route.originParkId !== homeParkId) {
    throw new ForbiddenError("You can only manage trips departing from your own park")
  }
  return trip
}

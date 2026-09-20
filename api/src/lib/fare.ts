import type { SeatClass } from '@prisma/client'
import { prisma } from './prisma'
import { NotFoundError, SegmentValidationError } from './segments'

const SEAT_CLASS_FARE_FIELD = {
  standard: 'fareStandard',
  luxury: 'fareLuxury',
  vip: 'fareVip',
} as const

export interface ResolvedFare {
  amount: import('@prisma/client').Prisma.Decimal
  seatClass: SeatClass
}

/**
 * The price for booking a trip's segment is always resolved server-side
 * from route_segments + the trip's bus class — never trust a
 * client-supplied amount when money is involved.
 */
export async function resolveFare(tripId: string, boardStopId: string, alightStopId: string): Promise<ResolvedFare> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: { bus: true } })
  if (!trip) throw new NotFoundError('Trip not found')
  if (!trip.bus) throw new NotFoundError('Trip has no bus assigned yet')

  const segment = await prisma.routeSegment.findFirst({
    where: { routeId: trip.routeId, fromStopId: boardStopId, toStopId: alightStopId },
  })
  if (!segment) throw new SegmentValidationError('No fare configured for this segment')

  const fareField = SEAT_CLASS_FARE_FIELD[trip.bus.class]
  return { amount: segment[fareField], seatClass: trip.bus.class }
}

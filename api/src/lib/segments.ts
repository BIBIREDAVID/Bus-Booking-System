import { prisma } from './prisma'

export class SegmentValidationError extends Error {}
export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

export interface ResolvedSegment {
  tripId: string
  routeId: string
  boardStopId: string
  alightStopId: string
  boardStopOrder: number
  alightStopOrder: number
}

/**
 * Validates that boardStopId/alightStopId are boarding-enabled stops on
 * the trip's route, in the correct order, and returns their stop_order
 * values (needed for the overlap queries in seat-map / hold-seat).
 */
export async function resolveSegment(
  tripId: string,
  boardStopId: string,
  alightStopId: string,
): Promise<ResolvedSegment> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } })
  if (!trip) throw new NotFoundError('Trip not found')

  if (boardStopId === alightStopId) {
    throw new SegmentValidationError('boardStopId and alightStopId must be different stops')
  }

  const [boardStop, alightStop] = await Promise.all([
    prisma.routeStop.findUnique({ where: { id: boardStopId } }),
    prisma.routeStop.findUnique({ where: { id: alightStopId } }),
  ])

  if (!boardStop || !alightStop) throw new NotFoundError('boardStopId/alightStopId not found')
  if (boardStop.routeId !== trip.routeId || alightStop.routeId !== trip.routeId) {
    throw new SegmentValidationError('boardStopId/alightStopId must belong to the trip\'s route')
  }
  if (!boardStop.isBoardingPoint || !alightStop.isBoardingPoint) {
    throw new SegmentValidationError('boardStopId/alightStopId must be boarding-enabled stops')
  }
  if (boardStop.stopOrder >= alightStop.stopOrder) {
    throw new SegmentValidationError('boardStopId must come before alightStopId on the route')
  }

  return {
    tripId,
    routeId: trip.routeId,
    boardStopId,
    alightStopId,
    boardStopOrder: boardStop.stopOrder,
    alightStopOrder: alightStop.stopOrder,
  }
}

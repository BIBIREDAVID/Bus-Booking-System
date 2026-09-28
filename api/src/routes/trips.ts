import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { getSeatMap } from '../lib/seatMap'
import { prisma } from '../lib/prisma'
import { NotFoundError, SegmentValidationError } from '../lib/segments'

export const tripsRouter = Router()

tripsRouter.use(requireAuth)

const SEAT_CLASS_FARE_FIELD = {
  standard: 'fareStandard',
  luxury: 'fareLuxury',
  vip: 'fareVip',
} as const

// ------------------------------------------------------------
// GET /trips/upcoming — every bookable trip across every route,
// full end-to-end (route origin -> route destination), soonest
// first. Lets a rider see what's available without already knowing
// which two parks to search — Search still supports a narrower
// origin/destination/date query for a specific journey.
// ------------------------------------------------------------

tripsRouter.get('/upcoming', async (_req, res) => {
  const trips = await prisma.trip.findMany({
    where: { status: 'scheduled', busId: { not: null }, departureTime: { gt: new Date() } },
    include: {
      route: {
        include: {
          originPark: true,
          destPark: true,
          routeStops: { where: { isBoardingPoint: true }, orderBy: { stopOrder: 'asc' } },
        },
      },
      bus: true,
    },
    orderBy: { departureTime: 'asc' },
    take: 20,
  })

  const results = await Promise.all(
    trips.map(async (trip) => {
      const stops = trip.route.routeStops
      const boardStop = stops[0]
      const alightStop = stops[stops.length - 1]

      const segment = await prisma.routeSegment.findFirst({
        where: { routeId: trip.routeId, fromStopId: boardStop.id, toStopId: alightStop.id },
      })
      const fareField = trip.bus ? SEAT_CLASS_FARE_FIELD[trip.bus.class] : null
      const fare = segment && fareField ? segment[fareField] : null

      return {
        tripId: trip.id,
        departureTime: trip.departureTime,
        boardStopId: boardStop.id,
        alightStopId: alightStop.id,
        originParkName: trip.route.originPark.name,
        destParkName: trip.route.destPark.name,
        bus: trip.bus && { plate: trip.bus.plate, class: trip.bus.class, capacity: trip.bus.capacity },
        fare,
      }
    }),
  )

  return res.status(200).json({ results })
})

const seatMapQuerySchema = z.object({
  boardStopId: z.string().uuid(),
  alightStopId: z.string().uuid(),
})

tripsRouter.get('/:tripId/seat-map', async (req, res) => {
  const parsed = seatMapQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid query' })
  }

  try {
    const seats = await getSeatMap(req.params.tripId, parsed.data.boardStopId, parsed.data.alightStopId)
    return res.status(200).json({ seats })
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ message: err.message })
    if (err instanceof SegmentValidationError) return res.status(400).json({ message: err.message })
    throw err
  }
})

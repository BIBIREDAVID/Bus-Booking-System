import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

export const searchRouter = Router()

searchRouter.use(requireAuth)

const querySchema = z.object({
  originParkId: z.string().uuid(),
  destParkId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
})

const SEAT_CLASS_FARE_FIELD = {
  standard: 'fareStandard',
  luxury: 'fareLuxury',
  vip: 'fareVip',
} as const

searchRouter.get('/', async (req, res) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid query' })
  }
  const { originParkId, destParkId, date } = parsed.data

  if (originParkId === destParkId) {
    return res.status(400).json({ message: 'originParkId and destParkId must be different' })
  }

  const [originPark, destPark] = await Promise.all([
    prisma.park.findUnique({ where: { id: originParkId } }),
    prisma.park.findUnique({ where: { id: destParkId } }),
  ])
  if (!originPark || !destPark) {
    return res.status(400).json({ message: 'originParkId/destParkId does not match an existing park' })
  }

  // Treated as a UTC calendar day — matches how trip.departureTime and
  // route_schedules.departure_time are generated (see jobs/generateTrips.ts).
  const [year, month, day] = date.split('-').map(Number)
  const dayStart = new Date(Date.UTC(year, month - 1, day))
  const dayEnd = new Date(Date.UTC(year, month - 1, day + 1))

  // A park can be a boarding-enabled stop on many routes — find every
  // route where BOTH parks are boarding stops, origin before dest.
  // Note: these are the *searched* parks, which may be intermediate
  // stops on a route whose overall origin/destination differ — the
  // route's own origin_park_id/dest_park_id are irrelevant here.
  const [originStops, destStops] = await Promise.all([
    prisma.routeStop.findMany({ where: { parkId: originParkId, isBoardingPoint: true } }),
    prisma.routeStop.findMany({ where: { parkId: destParkId, isBoardingPoint: true } }),
  ])

  const destByRoute = new Map(destStops.map((s) => [s.routeId, s]))
  const candidates = originStops
    .map((originStop) => {
      const destStop = destByRoute.get(originStop.routeId)
      if (!destStop || destStop.stopOrder <= originStop.stopOrder) return null
      return { routeId: originStop.routeId, boardStop: originStop, alightStop: destStop }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  if (candidates.length === 0) {
    return res.status(200).json({ results: [] })
  }

  const results = []
  for (const candidate of candidates) {
    const trips = await prisma.trip.findMany({
      where: {
        routeId: candidate.routeId,
        status: 'scheduled',
        busId: { not: null }, // no bus assigned yet means no seats exist to book
        departureTime: { gte: dayStart, lt: dayEnd },
      },
      include: { bus: true },
      orderBy: { departureTime: 'asc' },
    })

    if (trips.length === 0) continue

    const segment = await prisma.routeSegment.findFirst({
      where: { routeId: candidate.routeId, fromStopId: candidate.boardStop.id, toStopId: candidate.alightStop.id },
    })

    for (const trip of trips) {
      const fareField = trip.bus ? SEAT_CLASS_FARE_FIELD[trip.bus.class] : null
      const fare = segment && fareField ? segment[fareField] : null

      results.push({
        tripId: trip.id,
        departureTime: trip.departureTime,
        boardStopId: candidate.boardStop.id,
        alightStopId: candidate.alightStop.id,
        originParkName: originPark.name,
        destParkName: destPark.name,
        bus: trip.bus && { plate: trip.bus.plate, class: trip.bus.class, capacity: trip.bus.capacity },
        fare,
      })
    }
  }

  results.sort((a, b) => a.departureTime.getTime() - b.departureTime.getTime())

  return res.status(200).json({ results })
})

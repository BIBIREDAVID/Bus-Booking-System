import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

export const alertsRouter = Router()

alertsRouter.use(requireAuth)

// ------------------------------------------------------------
// GET /alerts — "Travel Updates": trip_alerts relevant to the rider's
// own upcoming (booked or reserved_unpaid) bookings — either an alert
// tied directly to one of their trips, or a route-wide alert covering
// a route one of their trips runs on.
// ------------------------------------------------------------

alertsRouter.get('/', async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: {
      userId: req.user!.id,
      status: { in: ['booked', 'reserved_unpaid'] },
      trip: { departureTime: { gt: new Date() } },
    },
    select: { tripId: true, trip: { select: { routeId: true } } },
  })

  if (bookings.length === 0) return res.status(200).json([])

  const tripIds = [...new Set(bookings.map((b) => b.tripId))]
  const routeIds = [...new Set(bookings.map((b) => b.trip.routeId))]

  const alerts = await prisma.tripAlert.findMany({
    where: { OR: [{ tripId: { in: tripIds } }, { routeId: { in: routeIds } }] },
    include: {
      trip: { include: { route: { include: { originPark: true, destPark: true } } } },
      route: { include: { originPark: true, destPark: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return res.status(200).json(
    alerts.map((alert) => ({
      id: alert.id,
      type: alert.type,
      message: alert.message,
      createdAt: alert.createdAt,
      tripLabel: alert.trip
        ? `${alert.trip.route.originPark.name} → ${alert.trip.route.destPark.name} (${alert.trip.departureTime.toISOString()})`
        : null,
      routeLabel: alert.route ? `${alert.route.originPark.name} → ${alert.route.destPark.name}` : null,
    })),
  )
})

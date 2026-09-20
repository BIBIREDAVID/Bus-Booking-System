import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import { notifyTripAlert } from '../../lib/notifications'

export const adminAlertsRouter = Router()

adminAlertsRouter.use(requireAuth, requireRole('admin'))

function serialize(alert: {
  id: string
  type: string
  message: string
  createdAt: Date
  tripId: string | null
  routeId: string | null
  trip: { departureTime: Date; route: { originPark: { name: string }; destPark: { name: string } } } | null
  route: { originPark: { name: string }; destPark: { name: string } } | null
}) {
  return {
    id: alert.id,
    type: alert.type,
    message: alert.message,
    createdAt: alert.createdAt,
    tripId: alert.tripId,
    routeId: alert.routeId,
    tripLabel: alert.trip
      ? `${alert.trip.route.originPark.name} → ${alert.trip.route.destPark.name} (${alert.trip.departureTime.toISOString()})`
      : null,
    routeLabel: alert.route ? `${alert.route.originPark.name} → ${alert.route.destPark.name}` : null,
  }
}

// ------------------------------------------------------------
// GET /admin/trip-alerts — recent alerts, newest first.
// ------------------------------------------------------------

adminAlertsRouter.get('/trip-alerts', async (_req, res) => {
  const alerts = await prisma.tripAlert.findMany({
    include: {
      trip: { include: { route: { include: { originPark: true, destPark: true } } } },
      route: { include: { originPark: true, destPark: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return res.status(200).json(alerts.map(serialize))
})

// ------------------------------------------------------------
// POST /admin/trip-alerts — post an alert tied to exactly one of a
// trip or a route, and notify every rider with an active booking on
// an affected, upcoming trip.
// ------------------------------------------------------------

const createSchema = z
  .object({
    type: z.enum(['delay', 'route_change', 'cancellation', 'holiday_notice']),
    message: z.string().trim().min(1).max(1000),
    tripId: z.string().uuid().optional(),
    routeId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.tripId) !== Boolean(v.routeId), {
    message: 'Provide exactly one of tripId or routeId',
  })

adminAlertsRouter.post('/trip-alerts', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { type, message, tripId, routeId } = parsed.data

  if (tripId) {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } })
    if (!trip) return res.status(400).json({ message: 'tripId does not match an existing trip' })
  }
  if (routeId) {
    const route = await prisma.route.findUnique({ where: { id: routeId } })
    if (!route) return res.status(400).json({ message: 'routeId does not match an existing route' })
  }

  const alert = await prisma.tripAlert.create({
    data: { type, message, tripId, routeId, createdBy: req.user!.id },
  })

  const { notifiedCount } = await notifyTripAlert(alert.id)

  return res.status(201).json({ id: alert.id, notifiedCount })
})

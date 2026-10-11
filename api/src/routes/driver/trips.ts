import { Router } from 'express'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import { requireDriverProfile } from '../../lib/driverScope'
import { ForbiddenError } from '../../lib/segments'

export const driverTripsRouter = Router()

driverTripsRouter.use(requireAuth, requireRole('driver'))

// ------------------------------------------------------------
// GET /driver/trips — this driver's own assigned trips (scheduled or
// in progress), soonest first. Scoped by Driver.id, not just filtered
// client-side — a driver can never see another driver's schedule.
// ------------------------------------------------------------

driverTripsRouter.get('/trips', async (req, res) => {
  try {
    const driver = await requireDriverProfile(req.user!.id)

    const trips = await prisma.trip.findMany({
      where: { driverId: driver.id, status: { in: ['scheduled', 'in_progress'] } },
      include: { route: { include: { originPark: true, destPark: true } }, bus: true },
      orderBy: { departureTime: 'asc' },
      take: 200,
    })

    return res.status(200).json(
      trips.map((t) => ({
        id: t.id,
        departureTime: t.departureTime,
        status: t.status,
        routeLabel: `${t.route.originPark.name} → ${t.route.destPark.name}`,
        bus: t.bus,
      })),
    )
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ message: err.message })
    throw err
  }
})

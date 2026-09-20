import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'

export const staffTripsRouter = Router()

staffTripsRouter.use(requireAuth, requireRole('park_staff'))

// ------------------------------------------------------------
// GET /staff/trips — trips departing from the staff member's own
// park (route.originParkId === req.user.homeParkId), for the manual
// booking and manifest screens to pick from. Scoped at the query
// level, not just filtered client-side.
// ------------------------------------------------------------

const listQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
})

staffTripsRouter.get('/trips', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid query' })

  const homeParkId = req.user!.homeParkId
  if (!homeParkId) return res.status(403).json({ message: 'Staff account has no home park configured' })

  let dateFilter: { gte: Date; lt: Date } | undefined
  if (parsed.data.date) {
    const [year, month, day] = parsed.data.date.split('-').map(Number)
    dateFilter = { gte: new Date(Date.UTC(year, month - 1, day)), lt: new Date(Date.UTC(year, month - 1, day + 1)) }
  }

  const trips = await prisma.trip.findMany({
    where: {
      route: { originParkId: homeParkId },
      status: 'scheduled',
      busId: { not: null },
      ...(dateFilter && { departureTime: dateFilter }),
    },
    include: {
      route: { include: { originPark: true, destPark: true } },
      bus: true,
    },
    orderBy: { departureTime: 'asc' },
    take: 200,
  })

  return res.status(200).json(
    trips.map((t) => ({
      id: t.id,
      departureTime: t.departureTime,
      routeLabel: `${t.route.originPark.name} → ${t.route.destPark.name}`,
      bus: t.bus,
    })),
  )
})

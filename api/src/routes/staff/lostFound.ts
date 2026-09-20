import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'

export const staffLostFoundRouter = Router()

staffLostFoundRouter.use(requireAuth, requireRole('park_staff'))

function serialize(item: {
  id: string
  type: string
  description: string
  contactInfo: string | null
  status: string
  createdAt: Date
  trip: { departureTime: Date; route: { originPark: { name: string }; destPark: { name: string } } } | null
}) {
  return {
    id: item.id,
    type: item.type,
    description: item.description,
    contactInfo: item.contactInfo,
    status: item.status,
    createdAt: item.createdAt,
    tripLabel: item.trip
      ? `${item.trip.route.originPark.name} → ${item.trip.route.destPark.name} (${item.trip.departureTime.toISOString()})`
      : null,
  }
}

const include = {
  trip: { include: { route: { include: { originPark: true, destPark: true } } } },
} as const

// ------------------------------------------------------------
// GET /staff/lost-found — items logged at the staff member's own park.
// ------------------------------------------------------------

staffLostFoundRouter.get('/lost-found', async (req, res) => {
  const homeParkId = req.user!.homeParkId
  if (!homeParkId) return res.status(403).json({ message: 'Staff account has no home park configured' })

  const items = await prisma.lostFoundItem.findMany({
    where: { homeParkId },
    include,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return res.status(200).json(items.map(serialize))
})

// ------------------------------------------------------------
// POST /staff/lost-found — log a found item at the staff member's park.
// ------------------------------------------------------------

const createSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  contactInfo: z.string().trim().max(200).optional(),
  tripId: z.string().uuid().optional(),
})

staffLostFoundRouter.post('/lost-found', async (req, res) => {
  const homeParkId = req.user!.homeParkId
  if (!homeParkId) return res.status(403).json({ message: 'Staff account has no home park configured' })

  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  const item = await prisma.lostFoundItem.create({
    data: {
      type: 'found',
      description: parsed.data.description,
      contactInfo: parsed.data.contactInfo,
      tripId: parsed.data.tripId,
      submittedBy: req.user!.id,
      homeParkId,
    },
    include,
  })
  return res.status(201).json(serialize(item))
})

// ------------------------------------------------------------
// PATCH /staff/lost-found/:id — update status (e.g. claimed, closed).
// Scoped to items logged at the staff member's own park.
// ------------------------------------------------------------

const updateSchema = z.object({ status: z.enum(['open', 'claimed', 'closed']) })

staffLostFoundRouter.patch('/lost-found/:id', async (req, res) => {
  const homeParkId = req.user!.homeParkId
  if (!homeParkId) return res.status(403).json({ message: 'Staff account has no home park configured' })

  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  const item = await prisma.lostFoundItem.findUnique({ where: { id: req.params.id } })
  if (!item) return res.status(404).json({ message: 'Item not found' })
  if (item.homeParkId !== homeParkId) {
    return res.status(403).json({ message: 'You can only manage items logged at your own park' })
  }

  const updated = await prisma.lostFoundItem.update({
    where: { id: item.id },
    data: { status: parsed.data.status },
    include,
  })
  return res.status(200).json(serialize(updated))
})

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

export const complaintsRouter = Router()

complaintsRouter.use(requireAuth)

function serialize(c: {
  id: string
  category: string
  message: string
  status: string
  resolutionNotes: string | null
  createdAt: Date
  resolvedAt: Date | null
  trip: { departureTime: Date; route: { originPark: { name: string }; destPark: { name: string } } } | null
}) {
  return {
    id: c.id,
    category: c.category,
    message: c.message,
    status: c.status,
    resolutionNotes: c.resolutionNotes,
    createdAt: c.createdAt,
    resolvedAt: c.resolvedAt,
    tripLabel: c.trip
      ? `${c.trip.route.originPark.name} → ${c.trip.route.destPark.name} (${c.trip.departureTime.toISOString()})`
      : null,
  }
}

// ------------------------------------------------------------
// GET /complaints — the rider's own complaints, newest first.
// ------------------------------------------------------------

complaintsRouter.get('/', async (req, res) => {
  const complaints = await prisma.complaint.findMany({
    where: { userId: req.user!.id },
    include: { trip: { include: { route: { include: { originPark: true, destPark: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
  return res.status(200).json(complaints.map(serialize))
})

// ------------------------------------------------------------
// POST /complaints — file a complaint, optionally linked to one of
// the rider's own trips.
// ------------------------------------------------------------

const createSchema = z.object({
  category: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(2000),
  tripId: z.string().uuid().optional(),
})

complaintsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { category, message, tripId } = parsed.data

  if (tripId) {
    // A rider can only link a complaint to a trip they actually booked.
    const owns = await prisma.booking.findFirst({ where: { tripId, userId: req.user!.id } })
    if (!owns) return res.status(400).json({ message: 'tripId does not match one of your bookings' })
  }

  const complaint = await prisma.complaint.create({
    data: { userId: req.user!.id, category, message, tripId },
    include: { trip: { include: { route: { include: { originPark: true, destPark: true } } } } },
  })
  return res.status(201).json(serialize(complaint))
})

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'

export const adminComplaintsRouter = Router()

adminComplaintsRouter.use(requireAuth, requireRole('admin'))

function serialize(c: {
  id: string
  category: string
  message: string
  status: string
  resolutionNotes: string | null
  createdAt: Date
  resolvedAt: Date | null
  user: { phone: string; name: string | null }
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
    riderPhone: c.user.phone,
    riderName: c.user.name,
    tripLabel: c.trip
      ? `${c.trip.route.originPark.name} → ${c.trip.route.destPark.name} (${c.trip.departureTime.toISOString()})`
      : null,
  }
}

const listQuerySchema = z.object({
  status: z.enum(['open', 'in_review', 'resolved']).optional(),
})

adminComplaintsRouter.get('/complaints', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Invalid query' })

  const complaints = await prisma.complaint.findMany({
    where: { ...(parsed.data.status && { status: parsed.data.status }) },
    include: {
      user: true,
      trip: { include: { route: { include: { originPark: true, destPark: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return res.status(200).json(complaints.map(serialize))
})

const updateSchema = z.object({
  status: z.enum(['open', 'in_review', 'resolved']),
  resolutionNotes: z.string().trim().max(2000).optional(),
})

adminComplaintsRouter.patch('/complaints/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } })
  if (!complaint) return res.status(404).json({ message: 'Complaint not found' })

  const updated = await prisma.complaint.update({
    where: { id: complaint.id },
    data: {
      status: parsed.data.status,
      resolutionNotes: parsed.data.resolutionNotes ?? complaint.resolutionNotes,
      assignedTo: req.user!.id,
      resolvedAt: parsed.data.status === 'resolved' ? new Date() : null,
    },
    include: {
      user: true,
      trip: { include: { route: { include: { originPark: true, destPark: true } } } },
    },
  })
  return res.status(200).json(serialize(updated))
})

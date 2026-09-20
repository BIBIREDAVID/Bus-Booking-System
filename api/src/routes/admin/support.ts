import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'

export const adminSupportRouter = Router()

adminSupportRouter.use(requireAuth, requireRole('admin'))

function serialize(t: {
  id: string
  category: string
  message: string
  status: string
  createdAt: Date
  user: { phone: string; name: string | null }
}) {
  return {
    id: t.id,
    category: t.category,
    message: t.message,
    status: t.status,
    createdAt: t.createdAt,
    riderPhone: t.user.phone,
    riderName: t.user.name,
  }
}

const listQuerySchema = z.object({
  status: z.enum(['open', 'resolved']).optional(),
  category: z.enum(['payment', 'booking', 'technical', 'other']).optional(),
})

adminSupportRouter.get('/support-tickets', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Invalid query' })

  const tickets = await prisma.supportTicket.findMany({
    where: {
      ...(parsed.data.status && { status: parsed.data.status }),
      ...(parsed.data.category && { category: parsed.data.category }),
    },
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return res.status(200).json(tickets.map(serialize))
})

const updateSchema = z.object({ status: z.enum(['open', 'resolved']) })

adminSupportRouter.patch('/support-tickets/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } })
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' })

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: parsed.data.status },
    include: { user: true },
  })
  return res.status(200).json(serialize(updated))
})

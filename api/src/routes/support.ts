import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

export const supportRouter = Router()

supportRouter.use(requireAuth)

function serialize(t: { id: string; category: string; message: string; status: string; createdAt: Date }) {
  return { id: t.id, category: t.category, message: t.message, status: t.status, createdAt: t.createdAt }
}

// ------------------------------------------------------------
// GET /support-tickets — the rider's own tickets, newest first.
// ------------------------------------------------------------

supportRouter.get('/', async (req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  })
  return res.status(200).json(tickets.map(serialize))
})

// ------------------------------------------------------------
// POST /support-tickets — open a support ticket.
// ------------------------------------------------------------

const createSchema = z.object({
  category: z.enum(['payment', 'booking', 'technical', 'other']),
  message: z.string().trim().min(1).max(2000),
})

supportRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  const ticket = await prisma.supportTicket.create({
    data: { userId: req.user!.id, category: parsed.data.category, message: parsed.data.message },
  })
  return res.status(201).json(serialize(ticket))
})

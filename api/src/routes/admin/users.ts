import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'

export const adminUsersRouter = Router()

adminUsersRouter.use(requireAuth, requireRole('admin'))

// Staff and admin accounts are never self-service — only an existing
// admin can promote a rider to park_staff or admin.
const promoteSchema = z
  .object({
    phone: z.string().trim().min(1),
    role: z.enum(['park_staff', 'admin']),
    homeParkId: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().uuid().optional(),
    ),
  })
  .refine((data) => data.role !== 'park_staff' || Boolean(data.homeParkId), {
    message: 'homeParkId is required when promoting to park_staff',
    path: ['homeParkId'],
  })

adminUsersRouter.post('/users/promote', async (req, res) => {
  const parsed = promoteSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { phone, role, homeParkId } = parsed.data

  const user = await prisma.user.findUnique({ where: { phone } })
  if (!user) return res.status(404).json({ message: 'No user found with that phone number' })

  if (homeParkId) {
    const park = await prisma.park.findUnique({ where: { id: homeParkId } })
    if (!park) return res.status(400).json({ message: 'homeParkId does not match an existing park' })
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role, homeParkId: role === 'park_staff' ? homeParkId : (homeParkId ?? user.homeParkId) },
  })

  return res.status(200).json({
    id: updated.id,
    name: updated.name,
    phone: updated.phone,
    role: updated.role,
    homeParkId: updated.homeParkId,
  })
})

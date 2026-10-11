import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { hashPassword } from '../../lib/password'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'

export const adminUsersRouter = Router()

adminUsersRouter.use(requireAuth, requireRole('admin'))

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address')
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters')
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number in international format')

function toPublicUser(user: {
  id: string
  name: string | null
  email: string
  phone: string | null
  role: string
  homeParkId: string | null
}) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, homeParkId: user.homeParkId }
}

// ------------------------------------------------------------
// POST /admin/staff — create a park-staff login. Never self-service.
// ------------------------------------------------------------

const createStaffSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional().or(z.literal('')),
  homeParkId: z.string().uuid('A home park is required for staff accounts'),
})

adminUsersRouter.post('/staff', async (req, res) => {
  const parsed = createStaffSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { name, email, password, phone, homeParkId } = parsed.data

  const park = await prisma.park.findUnique({ where: { id: homeParkId } })
  if (!park) return res.status(400).json({ message: 'homeParkId does not match an existing park' })

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return res.status(409).json({ message: 'An account with that email already exists' })

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: { name, email, passwordHash, phone: phone || null, role: 'park_staff', homeParkId },
  })

  return res.status(201).json(toPublicUser(user))
})

// ------------------------------------------------------------
// POST /admin/admins — create another admin login.
// ------------------------------------------------------------

const createAdminSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional().or(z.literal('')),
})

adminUsersRouter.post('/admins', async (req, res) => {
  const parsed = createAdminSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { name, email, password, phone } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return res.status(409).json({ message: 'An account with that email already exists' })

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: { name, email, passwordHash, phone: phone || null, role: 'admin' },
  })

  return res.status(201).json(toPublicUser(user))
})

// ------------------------------------------------------------
// POST /admin/drivers/:id/create-login — grants an EXISTING fleet
// Driver record (reference data, assignable to trips regardless of
// login access) a real login account. A Driver without a login still
// works everywhere trips/assignment are concerned — this just adds
// the ability for that person to sign in and see their own trips.
// ------------------------------------------------------------

const createDriverLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

adminUsersRouter.post('/drivers/:id/create-login', async (req, res) => {
  const parsed = createDriverLoginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { email, password } = parsed.data

  const driver = await prisma.driver.findUnique({ where: { id: req.params.id } })
  if (!driver) return res.status(404).json({ message: 'Driver not found' })
  if (driver.userId) return res.status(409).json({ message: 'This driver already has a login' })

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return res.status(409).json({ message: 'An account with that email already exists' })

  const passwordHash = await hashPassword(password)
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: driver.name, email, passwordHash, phone: null, role: 'driver' },
    })
    await tx.driver.update({ where: { id: driver.id }, data: { userId: user.id } })
    return user
  })

  return res.status(201).json(toPublicUser(result))
})

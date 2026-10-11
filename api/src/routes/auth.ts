import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { hashPassword, verifyPassword } from '../lib/password'
import { signAccessToken } from '../lib/jwt'
import { issueRefreshToken, rotateRefreshToken, revokeRefreshToken } from '../lib/refreshToken'
import { requireAuth } from '../middleware/auth'

export const authRouter = Router()

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address')
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters')

function toPublicUser(user: {
  id: string
  name: string | null
  email: string
  phone: string | null
  role: string
  homeParkId: string | null
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    homeParkId: user.homeParkId,
  }
}

async function issueSession(user: { id: string; role: 'rider' | 'park_staff' | 'driver' | 'admin'; homeParkId: string | null }) {
  const accessToken = signAccessToken({ sub: user.id, role: user.role, homeParkId: user.homeParkId })
  const refreshToken = await issueRefreshToken(user.id)
  return { accessToken, refreshToken }
}

// ------------------------------------------------------------
// POST /auth/register — rider self-signup only. Staff, driver and
// admin accounts are provisioned by an admin (see /admin/users),
// never self-service.
// ------------------------------------------------------------

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number in international format')
    .optional()
    .or(z.literal('')),
})

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { name, email, password, phone } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return res.status(409).json({ message: 'An account with that email already exists' })
  }

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: { name, email, passwordHash, phone: phone || null, role: 'rider' },
  })
  await prisma.$executeRaw`INSERT INTO wallets (user_id, balance) VALUES (${user.id}::uuid, 0) ON CONFLICT (user_id) DO NOTHING`

  const session = await issueSession(user)
  return res.status(201).json({ ...session, user: toPublicUser(user) })
})

// ------------------------------------------------------------
// POST /auth/login — email + password, any role. The server decides
// the role from the account itself; nothing about which "login page"
// the client used restricts or grants access.
// ------------------------------------------------------------

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1) })

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return res.status(401).json({ message: 'Incorrect email or password' })

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return res.status(401).json({ message: 'Incorrect email or password' })

  const session = await issueSession(user)
  return res.status(200).json({ ...session, user: toPublicUser(user) })
})

// ------------------------------------------------------------
// POST /auth/refresh
// ------------------------------------------------------------

const refreshSchema = z.object({ refreshToken: z.string().min(1) })

authRouter.post('/refresh', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid input' })
  }

  const rotated = await rotateRefreshToken(parsed.data.refreshToken)
  if (!rotated) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' })
  }

  const user = await prisma.user.findUnique({ where: { id: rotated.userId } })
  if (!user) return res.status(401).json({ message: 'User not found' })

  const accessToken = signAccessToken({ sub: user.id, role: user.role, homeParkId: user.homeParkId })

  return res.status(200).json({ accessToken, refreshToken: rotated.token })
})

// ------------------------------------------------------------
// POST /auth/logout
// ------------------------------------------------------------

authRouter.post('/logout', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body)
  if (parsed.success) {
    await revokeRefreshToken(parsed.data.refreshToken)
  }
  return res.status(204).send()
})

// ------------------------------------------------------------
// GET /auth/me
// ------------------------------------------------------------

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
  if (!user) return res.status(404).json({ message: 'User not found' })
  return res.status(200).json(toPublicUser(user))
})

// ------------------------------------------------------------
// PATCH /auth/me — profile edit (name, email, phone).
// ------------------------------------------------------------

const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: emailSchema.optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number in international format')
    .optional()
    .or(z.literal('')),
})

authRouter.patch('/me', requireAuth, async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { name, email, phone } = parsed.data

  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing && existing.id !== req.user!.id) {
      return res.status(409).json({ message: 'That email is already in use' })
    }
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
    },
  })

  return res.status(200).json(toPublicUser(user))
})

// ------------------------------------------------------------
// POST /auth/change-password
// ------------------------------------------------------------

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
})

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { currentPassword, newPassword } = parsed.data

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })
  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) return res.status(401).json({ message: 'Current password is incorrect' })

  const passwordHash = await hashPassword(newPassword)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

  return res.status(204).send()
})

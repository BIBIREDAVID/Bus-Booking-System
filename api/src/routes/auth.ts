import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { sendSms } from '../lib/sms'
import { generateOtpCode, hashOtpCode, verifyOtpCode } from '../lib/otp'
import { signAccessToken } from '../lib/jwt'
import { issueRefreshToken, rotateRefreshToken, revokeRefreshToken } from '../lib/refreshToken'
import { requireAuth } from '../middleware/auth'

export const authRouter = Router()

const OTP_EXPIRES_IN_MINUTES = Number(process.env.OTP_EXPIRES_IN_MINUTES ?? 5)
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5)
const OTP_MAX_REQUESTS_PER_WINDOW = Number(process.env.OTP_MAX_REQUESTS_PER_WINDOW ?? 5)
const OTP_REQUEST_WINDOW_MINUTES = Number(process.env.OTP_REQUEST_WINDOW_MINUTES ?? 10)

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number in international format')

function toPublicUser(user: {
  id: string
  name: string | null
  phone: string
  role: string
  homeParkId: string | null
}) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    homeParkId: user.homeParkId,
  }
}

// ------------------------------------------------------------
// POST /auth/request-otp
// ------------------------------------------------------------

const requestOtpSchema = z.object({ phone: phoneSchema })

authRouter.post('/request-otp', async (req, res) => {
  const parsed = requestOtpSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { phone } = parsed.data

  const windowStart = new Date(Date.now() - OTP_REQUEST_WINDOW_MINUTES * 60 * 1000)
  const recentRequestCount = await prisma.otpCode.count({
    where: { phone, createdAt: { gte: windowStart } },
  })
  if (recentRequestCount >= OTP_MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ message: 'Too many OTP requests. Try again later.' })
  }

  const code = generateOtpCode()
  const codeHash = await hashOtpCode(code)
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_IN_MINUTES * 60 * 1000)

  await prisma.otpCode.create({ data: { phone, codeHash, expiresAt } })

  await sendSms(phone, `Your BookMyBus verification code is ${code}. It expires in ${OTP_EXPIRES_IN_MINUTES} minutes.`)

  return res.status(200).json({ message: 'OTP sent' })
})

// ------------------------------------------------------------
// POST /auth/verify-otp
// ------------------------------------------------------------

const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

authRouter.post('/verify-otp', async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { phone, code } = parsed.data

  const otp = await prisma.otpCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
  if (!otp) {
    return res.status(400).json({ message: 'Code expired or not found. Request a new one.' })
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } })
    return res.status(400).json({ message: 'Too many incorrect attempts. Request a new code.' })
  }

  const isValid = await verifyOtpCode(code, otp.codeHash)
  if (!isValid) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } })
    return res.status(400).json({ message: 'Incorrect code' })
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } })

  let user = await prisma.user.findUnique({ where: { phone } })
  const isNewUser = !user
  if (!user) {
    user = await prisma.user.create({ data: { phone, role: 'rider' } })
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role, homeParkId: user.homeParkId })
  const refreshToken = await issueRefreshToken(user.id)

  return res.status(200).json({
    accessToken,
    refreshToken,
    isNewUser,
    user: toPublicUser(user),
  })
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
// PATCH /auth/me — name-entry step, right after first verification
// ------------------------------------------------------------

const updateMeSchema = z.object({ name: z.string().trim().min(1).max(100) })

authRouter.patch('/me', requireAuth, async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { name: parsed.data.name },
  })

  return res.status(200).json(toPublicUser(user))
})

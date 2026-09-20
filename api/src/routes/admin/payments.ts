import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'

export const adminPaymentsRouter = Router()

adminPaymentsRouter.use(requireAuth, requireRole('admin'))

// Wallet ledger — every fund/debit/refund, across all users. The
// source of truth for money movement (wallets.balance is just a cache).
const walletTxnQuerySchema = z.object({
  type: z.enum(['fund', 'debit', 'refund']).optional(),
  phone: z.string().optional(),
})

adminPaymentsRouter.get('/wallet-transactions', async (req, res) => {
  const parsed = walletTxnQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Invalid query' })

  const txns = await prisma.walletTransaction.findMany({
    where: {
      ...(parsed.data.type && { type: parsed.data.type }),
      ...(parsed.data.phone && { user: { phone: { contains: parsed.data.phone } } }),
    },
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return res.status(200).json(
    txns.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      bookingId: t.bookingId,
      riderPhone: t.user.phone,
      riderName: t.user.name,
      createdAt: t.createdAt,
    })),
  )
})

// Gateway payment attempts (Squad/Paystack top-ups) — pending until the
// webhook (or the dev simulate-payment endpoint) confirms them.
const intentQuerySchema = z.object({
  status: z.enum(['pending', 'succeeded', 'failed']).optional(),
  provider: z.enum(['squad', 'paystack']).optional(),
  phone: z.string().optional(),
})

adminPaymentsRouter.get('/payment-intents', async (req, res) => {
  const parsed = intentQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Invalid query' })

  const intents = await prisma.paymentIntent.findMany({
    where: {
      ...(parsed.data.status && { status: parsed.data.status }),
      ...(parsed.data.provider && { provider: parsed.data.provider }),
      ...(parsed.data.phone && { user: { phone: { contains: parsed.data.phone } } }),
    },
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return res.status(200).json(
    intents.map((i) => ({
      id: i.id,
      provider: i.provider,
      providerReference: i.providerReference,
      amount: i.amount,
      status: i.status,
      bookingId: i.bookingId,
      riderPhone: i.user.phone,
      riderName: i.user.name,
      createdAt: i.createdAt,
      completedAt: i.completedAt,
    })),
  )
})

// ------------------------------------------------------------
// POST /admin/wallet/:userId/recompute
// ------------------------------------------------------------
// wallets.balance is a denormalized cache (see schema.sql) — the
// wallet_transactions ledger is the source of truth. This is a safety
// net for correcting drift (a bug, a manual DB fix, whatever), not
// something riders trigger themselves.

adminPaymentsRouter.post('/wallet/:userId/recompute', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.userId } })
  if (!user) return res.status(404).json({ message: 'User not found' })

  const sums = await prisma.walletTransaction.groupBy({
    by: ['type'],
    where: { userId: req.params.userId },
    _sum: { amount: true },
  })

  const totals = { fund: 0, debit: 0, refund: 0 }
  for (const s of sums) totals[s.type] = Number(s._sum.amount ?? 0)
  const recomputedBalance = totals.fund + totals.refund - totals.debit

  const existingWallet = await prisma.wallet.findUnique({ where: { userId: req.params.userId } })
  const previousBalance = existingWallet ? Number(existingWallet.balance) : 0

  await prisma.wallet.upsert({
    where: { userId: req.params.userId },
    create: { userId: req.params.userId, balance: recomputedBalance },
    update: { balance: recomputedBalance, updatedAt: new Date() },
  })

  return res.status(200).json({
    userId: req.params.userId,
    previousBalance,
    recomputedBalance,
    corrected: previousBalance !== recomputedBalance,
  })
})

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { initializeGatewayPayment } from '../lib/paymentGateways'

export const walletRouter = Router()

walletRouter.use(requireAuth)

// ------------------------------------------------------------
// POST /wallet/topup/initiate
// ------------------------------------------------------------
// Starts a gateway payment for an amount the rider chose directly (not
// tied to any booking/seat hold). Credits happen only via the verified
// webhook path (routes/paymentsWebhook.ts `confirmPaymentIntentByReference`)
// — this endpoint never touches the wallet balance itself.

const initiateSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  provider: z.enum(['squad', 'paystack']),
})

walletRouter.post('/topup/initiate', async (req, res) => {
  const parsed = initiateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { amount, provider } = parsed.data

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })
  const { reference, checkoutUrl } = await initializeGatewayPayment(provider, {
    amountNaira: amount,
    email: user.email ?? `${user.phone.replace('+', '')}@bookmybus.local`,
  })

  await prisma.paymentIntent.create({
    data: {
      userId: req.user!.id,
      provider,
      providerReference: reference,
      amount,
      // No trip/seat/hold — this is a plain wallet top-up, not tied to
      // any booking (see the nullable columns' comment in schema.prisma).
    },
  })

  return res.status(201).json({ reference, checkoutUrl, amount })
})

// ------------------------------------------------------------
// GET /wallet — balance + paginated transaction history
// ------------------------------------------------------------

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

walletRouter.get('/', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Invalid query' })
  const { page, limit } = parsed.data

  const [wallet, total, transactions] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId: req.user!.id } }),
    prisma.walletTransaction.count({ where: { userId: req.user!.id } }),
    prisma.walletTransaction.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return res.status(200).json({
    // The balance column is a denormalized cache (see schema.sql) — a
    // brand-new user with no wallet row yet just has a balance of 0,
    // not an error.
    balance: wallet?.balance ?? 0,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      bookingId: t.bookingId,
      createdAt: t.createdAt,
    })),
    page,
    limit,
    total,
    hasMore: page * limit < total,
  })
})

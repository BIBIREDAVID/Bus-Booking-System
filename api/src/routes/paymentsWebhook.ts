import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { verifyWebhookSignature, type GatewayProvider } from '../lib/paymentGateways'
import { bookWithWallet } from '../lib/bookingTransaction'
import { notifyBookingConfirmation } from '../lib/notifications'

export const paymentsWebhookRouter = Router()

/**
 * Pulls the reference + success flag out of a gateway's webhook body.
 * Real payload shapes (verify against your provider dashboard's actual
 * webhook logs — this targets their commonly documented shape):
 *
 *   Paystack: { event: "charge.success", data: { reference, status: "success", ... } }
 *   Squad:    { Event: "charge_successful", TransactionRef, Body: { transaction_reference, transaction_status, ... } }
 */
function extractPaymentResult(
  provider: GatewayProvider,
  body: unknown,
): { reference: string; succeeded: boolean } | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>

  if (provider === 'paystack') {
    const data = b.data as Record<string, unknown> | undefined
    const reference = data?.reference
    if (typeof reference !== 'string') return null
    return { reference, succeeded: b.event === 'charge.success' && data?.status === 'success' }
  }

  // squad
  const nested = b.Body as Record<string, unknown> | undefined
  const reference = (b.TransactionRef ?? nested?.transaction_reference) as string | undefined
  if (typeof reference !== 'string') return null
  const status = (nested?.transaction_status ?? b.Event) as string | undefined
  return { reference, succeeded: b.Event === 'charge_successful' || status === 'success' }
}

export interface ConfirmResult {
  outcome: 'booked' | 'wallet-credited-only' | 'unknown-reference' | 'already-processed'
  bookingId: string | null
}

/**
 * Everything a verified "payment succeeded" event does, regardless of
 * how we got here (real webhook, or the dev-only simulate endpoint —
 * see routes/bookings.ts `POST /bookings/simulate-payment`). Signature
 * verification and payload parsing happen in the caller; by the time
 * this runs, the payment is treated as genuinely confirmed.
 */
export async function confirmPaymentIntentByReference(
  provider: GatewayProvider,
  reference: string,
): Promise<ConfirmResult> {
  const intent = await prisma.paymentIntent.findUnique({ where: { providerReference: reference } })
  if (!intent) {
    console.warn(`[payments:${provider}] no payment_intent for reference ${reference}`)
    return { outcome: 'unknown-reference', bookingId: null }
  }
  if (intent.status !== 'pending') {
    return { outcome: 'already-processed', bookingId: intent.bookingId }
  }

  // Step 1: the payment genuinely succeeded — always credit the wallet
  // first, in its own transaction, regardless of what happens next.
  // The user's money must never be lost just because their held seat
  // expired while they were on the payment page.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO wallets (user_id, balance) VALUES (${intent.userId}::uuid, 0)
      ON CONFLICT (user_id) DO NOTHING
    `
    await tx.$queryRaw`SELECT balance FROM wallets WHERE user_id = ${intent.userId}::uuid FOR UPDATE`
    await tx.wallet.update({
      where: { userId: intent.userId },
      data: { balance: { increment: intent.amount }, updatedAt: new Date() },
    })
    await tx.walletTransaction.create({
      data: { userId: intent.userId, type: 'fund', amount: intent.amount },
    })
  })

  // Step 2: if this intent has booking context (top-up-and-pay from
  // checkout), try to complete that booking with the topped-up wallet.
  // requireValidHold: false — see bookingTransaction.ts for why the
  // original hold expiring here is tolerated rather than fatal. A
  // plain wallet top-up (POST /wallet/topup/initiate) has no booking
  // context at all — nothing more to do once the wallet is credited.
  let bookingId: string | null = null
  if (intent.tripId && intent.seatId && intent.boardStopId && intent.alightStopId) {
    try {
      const booking = await bookWithWallet({
        userId: intent.userId,
        tripId: intent.tripId,
        seatId: intent.seatId,
        boardStopId: intent.boardStopId,
        alightStopId: intent.alightStopId,
        holdId: intent.holdId ?? undefined,
        requireValidHold: false,
      })
      bookingId = booking.id
      notifyBookingConfirmation(booking.id).catch((e) => console.error('[notifications] booking confirmation failed', e))
    } catch (err) {
      console.error(`[payments:${provider}] wallet was credited but booking failed for intent ${intent.id}:`, err)
    }
  }

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'succeeded', completedAt: new Date(), bookingId },
  })

  return { outcome: bookingId ? 'booked' : 'wallet-credited-only', bookingId }
}

async function handleWebhook(provider: GatewayProvider, rawBody: Buffer, signature: string | string[] | undefined) {
  if (!verifyWebhookSignature(provider, rawBody, signature)) {
    return { status: 401 as const, body: { message: 'Invalid signature' } }
  }

  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return { status: 400 as const, body: { message: 'Invalid JSON' } }
  }

  const result = extractPaymentResult(provider, parsedBody)
  if (!result) {
    return { status: 400 as const, body: { message: 'Unrecognized payload shape' } }
  }
  if (!result.succeeded) {
    // Not a success event (e.g. charge.failed) — acknowledge, nothing to do.
    return { status: 200 as const, body: { message: 'Ignored (not a success event)' } }
  }

  const confirmed = await confirmPaymentIntentByReference(provider, result.reference)
  return { status: 200 as const, body: { message: 'ok', booked: confirmed.outcome === 'booked' } }
}

paymentsWebhookRouter.post('/squad', async (req, res) => {
  const result = await handleWebhook('squad', req.body as Buffer, req.headers['x-squad-signature'])
  return res.status(result.status).json(result.body)
})

paymentsWebhookRouter.post('/paystack', async (req, res) => {
  const result = await handleWebhook('paystack', req.body as Buffer, req.headers['x-paystack-signature'])
  return res.status(result.status).json(result.body)
})

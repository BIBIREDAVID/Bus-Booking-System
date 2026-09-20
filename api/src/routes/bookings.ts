import { Router, type Response } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { holdSeat, SeatConflictError } from '../lib/holdSeat'
import { NotFoundError, SegmentValidationError } from '../lib/segments'
import { resolveFare } from '../lib/fare'
import { bookWithWallet, bookPayAtPark, HoldExpiredError, InsufficientBalanceError } from '../lib/bookingTransaction'
import { initializeGatewayPayment } from '../lib/paymentGateways'
import { confirmPaymentIntentByReference } from './paymentsWebhook'
import { serializeTicket } from '../lib/ticket'
import { refundBookingToWallet } from '../lib/refunds'
import { notifyBookingConfirmation } from '../lib/notifications'

export const bookingsRouter = Router()

bookingsRouter.use(requireAuth)

function handleBookingError(err: unknown, res: Response) {
  if (err instanceof SeatConflictError) return res.status(409).json({ message: err.message })
  if (err instanceof HoldExpiredError) return res.status(410).json({ message: err.message })
  if (err instanceof InsufficientBalanceError) return res.status(402).json({ message: err.message })
  if (err instanceof NotFoundError) return res.status(404).json({ message: err.message })
  if (err instanceof SegmentValidationError) return res.status(400).json({ message: err.message })
  throw err
}

async function loadHoldForUser(holdId: string, userId: string) {
  const hold = await prisma.seatHold.findUnique({ where: { id: holdId } })
  if (!hold || hold.userId !== userId) throw new NotFoundError('Hold not found')
  return hold
}

// ------------------------------------------------------------
// POST /bookings/hold
// ------------------------------------------------------------

const holdSchema = z.object({
  tripId: z.string().uuid(),
  seatId: z.string().uuid(),
  boardStopId: z.string().uuid(),
  alightStopId: z.string().uuid(),
})

bookingsRouter.post('/hold', async (req, res) => {
  const parsed = holdSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  try {
    const hold = await holdSeat({ ...parsed.data, userId: req.user!.id })
    return res.status(201).json({ holdId: hold.id, expiresAt: hold.expiresAt })
  } catch (err) {
    return handleBookingError(err, res)
  }
})

// ------------------------------------------------------------
// POST /bookings/pay-with-wallet
// ------------------------------------------------------------

const holdIdSchema = z.object({ holdId: z.string().uuid() })

bookingsRouter.post('/pay-with-wallet', async (req, res) => {
  const parsed = holdIdSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  try {
    const hold = await loadHoldForUser(parsed.data.holdId, req.user!.id)
    const booking = await bookWithWallet({
      userId: req.user!.id,
      tripId: hold.tripId,
      seatId: hold.seatId,
      boardStopId: hold.boardStopId,
      alightStopId: hold.alightStopId,
      holdId: hold.id,
      requireValidHold: true,
    })
    const ticket = await serializeTicket(booking.id)
    notifyBookingConfirmation(booking.id).catch((err) => console.error('[notifications] booking confirmation failed', err))
    return res.status(201).json({ ticket })
  } catch (err) {
    return handleBookingError(err, res)
  }
})

// ------------------------------------------------------------
// POST /bookings/pay-at-park
// ------------------------------------------------------------

bookingsRouter.post('/pay-at-park', async (req, res) => {
  const parsed = holdIdSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  try {
    const hold = await loadHoldForUser(parsed.data.holdId, req.user!.id)
    const booking = await bookPayAtPark({
      userId: req.user!.id,
      tripId: hold.tripId,
      seatId: hold.seatId,
      boardStopId: hold.boardStopId,
      alightStopId: hold.alightStopId,
      holdId: hold.id,
    })
    const ticket = await serializeTicket(booking.id)
    notifyBookingConfirmation(booking.id).catch((err) => console.error('[notifications] booking confirmation failed', err))
    return res.status(201).json({ ticket })
  } catch (err) {
    return handleBookingError(err, res)
  }
})

// ------------------------------------------------------------
// POST /bookings/top-up-and-pay
// ------------------------------------------------------------
// Wallet balance is short — initiates a gateway payment for just the
// shortfall. The actual wallet credit + booking only happen once the
// webhook confirms the payment (see routes/paymentsWebhook.ts) — the
// frontend never gets to mark this paid itself.

const topUpSchema = z.object({
  holdId: z.string().uuid(),
  provider: z.enum(['squad', 'paystack']),
})

bookingsRouter.post('/top-up-and-pay', async (req, res) => {
  const parsed = topUpSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  try {
    const hold = await loadHoldForUser(parsed.data.holdId, req.user!.id)
    if (hold.expiresAt <= new Date()) {
      throw new HoldExpiredError('Your seat hold has expired — please select your seat again')
    }

    const { amount } = await resolveFare(hold.tripId, hold.boardStopId, hold.alightStopId)
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } })
    const balance = wallet ? Number(wallet.balance) : 0
    const shortfall = Number(amount) - balance

    if (shortfall <= 0) {
      return res.status(400).json({ message: 'Wallet balance already covers this fare — use pay-with-wallet instead' })
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })
    const { reference, checkoutUrl } = await initializeGatewayPayment(parsed.data.provider, {
      amountNaira: shortfall,
      email: user.email ?? `${user.phone.replace('+', '')}@bookmybus.local`,
    })

    await prisma.paymentIntent.create({
      data: {
        userId: req.user!.id,
        provider: parsed.data.provider,
        providerReference: reference,
        amount: shortfall,
        holdId: hold.id,
        tripId: hold.tripId,
        seatId: hold.seatId,
        boardStopId: hold.boardStopId,
        alightStopId: hold.alightStopId,
      },
    })

    return res.status(201).json({ reference, checkoutUrl, shortfall })
  } catch (err) {
    return handleBookingError(err, res)
  }
})

// ------------------------------------------------------------
// POST /bookings/simulate-payment — DEV ONLY
// ------------------------------------------------------------
// Stands in for the gateway actually calling our webhook. Real
// Squad/Paystack payments are never simulated in production — this
// route doesn't exist there. It runs the *exact* same confirmation
// logic the real webhook uses (lib/paymentsWebhook.ts), just without
// a signature to verify, so it's a faithful stand-in for "the gateway
// just told us this reference succeeded."

const simulateSchema = z.object({
  reference: z.string().min(1),
  provider: z.enum(['squad', 'paystack']),
})

bookingsRouter.post('/simulate-payment', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' })
  }

  const parsed = simulateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  const intent = await prisma.paymentIntent.findUnique({ where: { providerReference: parsed.data.reference } })
  if (!intent || intent.userId !== req.user!.id) {
    return res.status(404).json({ message: 'No pending payment found for that reference' })
  }

  const result = await confirmPaymentIntentByReference(parsed.data.provider, parsed.data.reference)

  if (result.outcome === 'booked' && result.bookingId) {
    const ticket = await serializeTicket(result.bookingId)
    return res.status(200).json({ outcome: result.outcome, ticket })
  }

  return res.status(200).json({ outcome: result.outcome, ticket: null })
})

// ------------------------------------------------------------
// GET /bookings — "My Bookings" list
// ------------------------------------------------------------

bookingsRouter.get('/', async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  })
  const tickets = await Promise.all(bookings.map((b) => serializeTicket(b.id)))
  return res.status(200).json({ bookings: tickets })
})

// ------------------------------------------------------------
// GET /bookings/:id — for displaying the e-ticket
// ------------------------------------------------------------

bookingsRouter.get('/:id', async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
    if (!booking || booking.userId !== req.user!.id) {
      return res.status(404).json({ message: 'Booking not found' })
    }
    const ticket = await serializeTicket(booking.id)
    return res.status(200).json({ ticket })
  } catch (err) {
    return handleBookingError(err, res)
  }
})

// ------------------------------------------------------------
// POST /bookings/:id/cancel
// ------------------------------------------------------------
// Fixed policy, computed server-side — never trust the client:
//   >24h before departure  -> 100% refund to wallet
//   <24h before departure  -> cancelled, no refund
// A 'reserved_unpaid' (pay-at-park) booking was never paid, so it's
// just released with no refund logic regardless of timing.

const ONE_HOUR_MS = 60 * 60 * 1000

bookingsRouter.post('/:id/cancel', async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id }, include: { trip: true } })
    if (!booking || booking.userId !== req.user!.id) {
      throw new NotFoundError('Booking not found')
    }
    if (booking.status !== 'booked' && booking.status !== 'reserved_unpaid') {
      throw new SegmentValidationError(`Booking is ${booking.status} and cannot be cancelled`)
    }

    const wasPaid = booking.status === 'booked'
    const hoursUntilDeparture = (booking.trip.departureTime.getTime() - Date.now()) / ONE_HOUR_MS
    const shouldRefund = wasPaid && hoursUntilDeparture > 24

    // Compare-and-swap on status: only one concurrent request can win
    // this update (a single UPDATE ... WHERE is atomic at the row
    // level), so we can never double-cancel / double-refund the same
    // booking under a race.
    const claimed = await prisma.booking.updateMany({
      where: { id: booking.id, status: booking.status },
      data: { status: 'cancelled' },
    })
    if (claimed.count === 0) {
      throw new SegmentValidationError('Booking was already modified — please refresh and try again')
    }

    if (shouldRefund) {
      await refundBookingToWallet(booking)
    }

    const ticket = await serializeTicket(booking.id)
    return res.status(200).json({ ticket, refunded: shouldRefund })
  } catch (err) {
    return handleBookingError(err, res)
  }
})

// ------------------------------------------------------------
// POST /bookings/:id/reschedule
// ------------------------------------------------------------
// Allowed once per booking (enforced implicitly: once a booking is
// rescheduled it's cancelled, so a second attempt on the same id fails
// the status check below — the newly created booking is a distinct
// row with its own one-time allowance), up to 2h before departure.
// The new segment is booked FIRST, through the exact same
// seat-locking + overlap-check + wallet-debit transaction as a normal
// booking (lib/bookingTransaction.ts) — only once that succeeds is the
// old booking released, so a failed reschedule leaves the original
// booking completely untouched.

const rescheduleSchema = z.object({
  tripId: z.string().uuid(),
  seatId: z.string().uuid(),
  boardStopId: z.string().uuid(),
  alightStopId: z.string().uuid(),
})

bookingsRouter.post('/:id/reschedule', async (req, res) => {
  const parsed = rescheduleSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id }, include: { trip: true } })
    if (!booking || booking.userId !== req.user!.id) {
      throw new NotFoundError('Booking not found')
    }
    if (booking.status !== 'booked') {
      throw new SegmentValidationError('Only a confirmed, paid booking can be rescheduled')
    }

    const hoursUntilDeparture = (booking.trip.departureTime.getTime() - Date.now()) / ONE_HOUR_MS
    if (hoursUntilDeparture < 2) {
      throw new SegmentValidationError('Reschedule closes 2 hours before departure')
    }

    const newTrip = await prisma.trip.findUnique({ where: { id: parsed.data.tripId } })
    if (!newTrip) throw new NotFoundError('New trip not found')
    if (newTrip.departureTime <= new Date()) {
      throw new SegmentValidationError('New trip must depart in the future')
    }

    // Book the new segment first — the fare is computed server-side
    // from the new segment, same as any other booking. If this
    // throws (seat conflict, insufficient balance, etc.), execution
    // stops here and the original booking is left exactly as it was.
    const newBooking = await bookWithWallet({
      userId: req.user!.id,
      tripId: parsed.data.tripId,
      seatId: parsed.data.seatId,
      boardStopId: parsed.data.boardStopId,
      alightStopId: parsed.data.alightStopId,
      requireValidHold: false,
    })

    const released = await prisma.booking.updateMany({
      where: { id: booking.id, status: 'booked' },
      data: { status: 'cancelled' },
    })
    if (released.count === 0) {
      // The new booking is already confirmed at this point — this
      // would leave the rider holding both. Extremely unlikely (the
      // old booking's status can only have changed via another
      // request in the same narrow window), but log loudly rather
      // than fail silently.
      console.error(
        `[reschedule] new booking ${newBooking.id} created but old booking ${booking.id} could not be released`,
      )
    }

    const ticket = await serializeTicket(newBooking.id)
    notifyBookingConfirmation(newBooking.id).catch((err) => console.error('[notifications] booking confirmation failed', err))
    return res.status(200).json({ ticket })
  } catch (err) {
    return handleBookingError(err, res)
  }
})

// ------------------------------------------------------------
// POST /bookings/:id/rating — post-trip rating. Only the rider who
// took the trip can rate it, only once the trip has actually
// completed, and only once ever (booking_ratings.booking_id is the
// primary key — a second attempt hits the unique constraint).
// ------------------------------------------------------------

const ratingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
})

bookingsRouter.post('/:id/rating', async (req, res) => {
  const parsed = ratingSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
  if (!booking || booking.userId !== req.user!.id) {
    return res.status(404).json({ message: 'Booking not found' })
  }
  if (booking.status !== 'completed') {
    return res.status(400).json({ message: 'Only a completed trip can be rated' })
  }

  try {
    await prisma.bookingRating.create({
      data: { bookingId: booking.id, stars: parsed.data.stars, comment: parsed.data.comment },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ message: 'This trip has already been rated' })
    }
    throw err
  }

  const ticket = await serializeTicket(booking.id)
  return res.status(201).json({ ticket })
})

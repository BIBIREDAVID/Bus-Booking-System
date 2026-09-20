import { Router, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import { requireTripAtHomePark } from '../../lib/staffScope'
import { NotFoundError, SegmentValidationError, ForbiddenError } from '../../lib/segments'
import { bookManual, InsufficientBalanceError } from '../../lib/bookingTransaction'
import { notifyBookingConfirmation } from '../../lib/notifications'
import { SeatConflictError } from '../../lib/holdSeat'
import { serializeTicket } from '../../lib/ticket'

export const staffBookingsRouter = Router()

staffBookingsRouter.use(requireAuth, requireRole('park_staff'))

function handleError(err: unknown, res: Response) {
  if (err instanceof SeatConflictError) return res.status(409).json({ message: err.message })
  if (err instanceof InsufficientBalanceError) return res.status(402).json({ message: err.message })
  if (err instanceof NotFoundError) return res.status(404).json({ message: err.message })
  if (err instanceof SegmentValidationError) return res.status(400).json({ message: err.message })
  if (err instanceof ForbiddenError) return res.status(403).json({ message: err.message })
  throw err
}

function requireHomePark(res: Response, homeParkId: string | null): homeParkId is string {
  if (!homeParkId) {
    res.status(403).json({ message: 'Staff account has no home park configured' })
    return false
  }
  return true
}

// ------------------------------------------------------------
// POST /staff/bookings/manual — walk-in / phone booking, staff-
// initiated. Same seat-map + segment + payment logic as the rider app
// (bookManual reuses the identical seat-locking/overlap-check
// transaction), scoped so staff can only sell seats on trips departing
// from their own park, and boarding at their own park's stop.
// ------------------------------------------------------------

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number in international format')

const manualBookingSchema = z.object({
  tripId: z.string().uuid(),
  seatId: z.string().uuid(),
  boardStopId: z.string().uuid(),
  alightStopId: z.string().uuid(),
  passengerName: z.string().trim().min(1),
  passengerPhone: phoneSchema,
  paymentMethod: z.enum(['pay_at_park', 'wallet']).optional().default('pay_at_park'),
})

staffBookingsRouter.post('/bookings/manual', async (req, res) => {
  const homeParkId = req.user!.homeParkId
  if (!requireHomePark(res, homeParkId)) return

  const parsed = manualBookingSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { tripId, seatId, boardStopId, alightStopId, passengerName, passengerPhone, paymentMethod } = parsed.data

  try {
    await requireTripAtHomePark(tripId, homeParkId)

    const boardStop = await prisma.routeStop.findUnique({ where: { id: boardStopId } })
    if (!boardStop) throw new NotFoundError('boardStopId not found')
    if (boardStop.parkId !== homeParkId) {
      throw new ForbiddenError('Passengers can only be boarded at your own park')
    }

    let passenger = await prisma.user.findUnique({ where: { phone: passengerPhone } })
    if (!passenger) {
      passenger = await prisma.user.create({ data: { phone: passengerPhone, name: passengerName, role: 'rider' } })
    } else if (!passenger.name && passengerName) {
      passenger = await prisma.user.update({ where: { id: passenger.id }, data: { name: passengerName } })
    }

    const booking = await bookManual({
      userId: passenger.id,
      performedBy: req.user!.id,
      tripId,
      seatId,
      boardStopId,
      alightStopId,
      paymentMethod,
    })

    const ticket = await serializeTicket(booking.id)
    notifyBookingConfirmation(booking.id).catch((err) => console.error('[notifications] booking confirmation failed', err))
    return res.status(201).json({ ticket })
  } catch (err) {
    return handleError(err, res)
  }
})

// ------------------------------------------------------------
// GET /staff/bookings/pending-payments — reserved_unpaid bookings
// boarding at the staff member's own park, for the counter to collect
// cash against.
// ------------------------------------------------------------

function serializePending(booking: {
  id: string
  amount: unknown
  class: string
  createdAt: Date
  payAtParkCutoff: Date | null
  user: { phone: string; name: string | null }
  seat: { seatNumber: string }
  boardStop: { park: { name: string } }
  alightStop: { park: { name: string } }
  trip: { departureTime: Date; bus: { plate: string } | null }
}) {
  return {
    id: booking.id,
    amount: booking.amount,
    class: booking.class,
    createdAt: booking.createdAt,
    payAtParkCutoff: booking.payAtParkCutoff,
    riderPhone: booking.user.phone,
    riderName: booking.user.name,
    seatNumber: booking.seat.seatNumber,
    boardParkName: booking.boardStop.park.name,
    alightParkName: booking.alightStop.park.name,
    departureTime: booking.trip.departureTime,
    busPlate: booking.trip.bus?.plate ?? null,
  }
}

staffBookingsRouter.get('/bookings/pending-payments', async (req, res) => {
  const homeParkId = req.user!.homeParkId
  if (!requireHomePark(res, homeParkId)) return

  const bookings = await prisma.booking.findMany({
    where: {
      status: 'reserved_unpaid',
      boardStop: { parkId: homeParkId },
      trip: { status: 'scheduled' },
    },
    include: {
      user: true,
      seat: true,
      boardStop: { include: { park: true } },
      alightStop: { include: { park: true } },
      trip: { include: { bus: true } },
    },
    orderBy: { trip: { departureTime: 'asc' } },
    take: 200,
  })

  return res.status(200).json(bookings.map(serializePending))
})

// ------------------------------------------------------------
// POST /staff/bookings/:id/mark-paid — counter collected cash;
// flip reserved_unpaid -> booked. Compare-and-swap so a double-click
// or two staff members can't double-process the same booking.
// ------------------------------------------------------------

staffBookingsRouter.post('/bookings/:id/mark-paid', async (req, res) => {
  const homeParkId = req.user!.homeParkId
  if (!requireHomePark(res, homeParkId)) return

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { boardStop: true },
  })
  if (!booking) return res.status(404).json({ message: 'Booking not found' })
  if (booking.boardStop.parkId !== homeParkId) {
    return res.status(403).json({ message: 'You can only manage bookings boarding at your own park' })
  }
  if (booking.status !== 'reserved_unpaid') {
    return res.status(400).json({ message: `Booking is ${booking.status} and cannot be marked paid` })
  }

  const updated = await prisma.booking.updateMany({
    where: { id: booking.id, status: 'reserved_unpaid' },
    data: { status: 'booked' },
  })
  if (updated.count === 0) {
    return res.status(409).json({ message: 'Booking was already processed' })
  }

  const ticket = await serializeTicket(booking.id)
  return res.status(200).json({ ticket })
})

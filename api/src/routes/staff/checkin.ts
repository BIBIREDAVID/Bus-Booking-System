import { Router, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'

export const staffCheckinRouter = Router()

staffCheckinRouter.use(requireAuth, requireRole('park_staff'))

function requireHomePark(res: Response, homeParkId: string | null): homeParkId is string {
  if (!homeParkId) {
    res.status(403).json({ message: 'Staff account has no home park configured' })
    return false
  }
  return true
}

function serialize(booking: {
  id: string
  status: string
  boardedAt: Date | null
  user: { phone: string; name: string | null }
  seat: { seatNumber: string }
  boardStop: { park: { name: string } }
  alightStop: { park: { name: string } }
  trip: { departureTime: Date }
}) {
  return {
    id: booking.id,
    status: booking.status,
    boarded: booking.boardedAt !== null,
    boardedAt: booking.boardedAt,
    riderPhone: booking.user.phone,
    riderName: booking.user.name,
    seatNumber: booking.seat.seatNumber,
    boardParkName: booking.boardStop.park.name,
    alightParkName: booking.alightStop.park.name,
    departureTime: booking.trip.departureTime,
  }
}

// ------------------------------------------------------------
// GET /staff/checkin/search?query=... — find a booking by passenger
// name/phone, or by booking id (what the ticket's QR code encodes —
// see QRCodeSVG value={ticket.bookingId} in web/src/pages/rider/Ticket.jsx).
// Scoped to bookings boarding at the staff member's own park; a
// booking id for another park's trip is simply excluded, same as a
// name/phone search would be — not an information leak, just scope.
// ------------------------------------------------------------

const searchQuerySchema = z.object({ query: z.string().trim().min(1) })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

staffCheckinRouter.get('/checkin/search', async (req, res) => {
  const homeParkId = req.user!.homeParkId
  if (!requireHomePark(res, homeParkId)) return

  const parsed = searchQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Invalid query' })
  const { query } = parsed.data

  const bookings = await prisma.booking.findMany({
    where: {
      status: 'booked',
      boardStop: { parkId: homeParkId },
      trip: { status: 'scheduled' },
      ...(UUID_RE.test(query)
        ? { id: query }
        : {
            OR: [
              { user: { phone: { contains: query } } },
              { user: { name: { contains: query, mode: 'insensitive' } } },
            ],
          }),
    },
    include: {
      user: true,
      seat: true,
      boardStop: { include: { park: true } },
      alightStop: { include: { park: true } },
      trip: true,
    },
    orderBy: { trip: { departureTime: 'asc' } },
    take: 50,
  })

  return res.status(200).json(bookings.map(serialize))
})

// ------------------------------------------------------------
// POST /staff/checkin/:id/board — mark a booking boarded. Only a
// 'booked' (paid) reservation on a segment boarding at this park can
// be checked in; compare-and-swap on boardedAt prevents a double scan
// from doing anything the second time (still returns 200, idempotent).
// ------------------------------------------------------------

staffCheckinRouter.post('/checkin/:id/board', async (req, res) => {
  const homeParkId = req.user!.homeParkId
  if (!requireHomePark(res, homeParkId)) return

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: {
      user: true,
      seat: true,
      boardStop: { include: { park: true } },
      alightStop: { include: { park: true } },
      trip: true,
    },
  })
  if (!booking) return res.status(404).json({ message: 'Booking not found' })
  if (booking.boardStop.parkId !== homeParkId) {
    return res.status(403).json({ message: 'You can only check in passengers boarding at your own park' })
  }
  if (booking.status !== 'booked') {
    return res.status(400).json({ message: `Booking is ${booking.status} and cannot be checked in` })
  }

  if (!booking.boardedAt) {
    await prisma.booking.updateMany({
      where: { id: booking.id, boardedAt: null },
      data: { boardedAt: new Date() },
    })
  }

  const fresh = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    include: {
      user: true,
      seat: true,
      boardStop: { include: { park: true } },
      alightStop: { include: { park: true } },
      trip: true,
    },
  })

  return res.status(200).json(serialize(fresh))
})

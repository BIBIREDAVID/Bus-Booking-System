import { Router } from 'express'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import { requireTripAtHomePark } from '../../lib/staffScope'
import { NotFoundError, ForbiddenError } from '../../lib/segments'

export const staffManifestRouter = Router()

staffManifestRouter.use(requireAuth, requireRole('park_staff'))

// ------------------------------------------------------------
// GET /staff/manifest/:tripId — live passenger manifest for a trip,
// sorted by seat number. Scoped to trips departing from the staff
// member's own park.
// ------------------------------------------------------------

staffManifestRouter.get('/manifest/:tripId', async (req, res) => {
  const homeParkId = req.user!.homeParkId
  if (!homeParkId) return res.status(403).json({ message: 'Staff account has no home park configured' })

  try {
    const trip = await requireTripAtHomePark(req.params.tripId, homeParkId)

    const bookings = await prisma.booking.findMany({
      where: {
        tripId: trip.id,
        status: { in: ['booked', 'reserved_unpaid', 'completed'] },
      },
      include: {
        user: true,
        seat: true,
        boardStop: { include: { park: true } },
        alightStop: { include: { park: true } },
      },
    })

    const passengers = bookings
      .map((b) => ({
        bookingId: b.id,
        passengerName: b.user.name,
        passengerPhone: b.user.phone,
        seatNumber: b.seat.seatNumber,
        segment: `${b.boardStop.park.name} → ${b.alightStop.park.name}`,
        status: b.status,
        boarded: b.boardedAt !== null,
        boardedAt: b.boardedAt,
      }))
      .sort((a, b) => parseInt(a.seatNumber, 10) - parseInt(b.seatNumber, 10))

    return res.status(200).json({
      trip: {
        id: trip.id,
        departureTime: trip.departureTime,
        routeLabel: `${trip.route.originPark.name} → ${trip.route.destPark.name}`,
        busPlate: trip.bus?.plate ?? null,
      },
      passengers,
    })
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ message: err.message })
    if (err instanceof ForbiddenError) return res.status(403).json({ message: err.message })
    throw err
  }
})

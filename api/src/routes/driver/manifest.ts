import { Router } from 'express'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import { requireDriverProfile } from '../../lib/driverScope'
import { NotFoundError, ForbiddenError } from '../../lib/segments'

export const driverManifestRouter = Router()

driverManifestRouter.use(requireAuth, requireRole('driver'))

// ------------------------------------------------------------
// GET /driver/manifest/:tripId — live passenger manifest for one of
// this driver's own trips, sorted by seat number. Same shape as the
// park-staff manifest, scoped by Trip.driverId instead of home park.
// ------------------------------------------------------------

driverManifestRouter.get('/manifest/:tripId', async (req, res) => {
  try {
    const driver = await requireDriverProfile(req.user!.id)

    const trip = await prisma.trip.findUnique({
      where: { id: req.params.tripId },
      include: { route: { include: { originPark: true, destPark: true } }, bus: true },
    })
    if (!trip) throw new NotFoundError('Trip not found')
    if (trip.driverId !== driver.id) throw new ForbiddenError('You can only view the manifest for your own trips')

    const bookings = await prisma.booking.findMany({
      where: { tripId: trip.id, status: { in: ['booked', 'reserved_unpaid', 'completed'] } },
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

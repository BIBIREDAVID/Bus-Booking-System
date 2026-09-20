import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import { refundBookingToWallet } from '../../lib/refunds'

export const adminTripsRouter = Router()

adminTripsRouter.use(requireAuth, requireRole('admin'))

function serialize(trip: {
  id: string
  departureTime: Date
  status: string
  route: { originPark: { name: string }; destPark: { name: string } }
  bus: { id: string; plate: string; capacity: number; class: string } | null
  driver: { id: string; name: string } | null
  _count: { tripSeats: number }
}) {
  return {
    id: trip.id,
    departureTime: trip.departureTime,
    status: trip.status,
    routeLabel: `${trip.route.originPark.name} → ${trip.route.destPark.name}`,
    bus: trip.bus,
    driver: trip.driver,
    seatCount: trip._count.tripSeats,
  }
}

const listQuerySchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
  routeId: z.string().uuid().optional(),
})

adminTripsRouter.get('/trips', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Invalid query' })

  const trips = await prisma.trip.findMany({
    where: {
      ...(parsed.data.status && { status: parsed.data.status }),
      ...(parsed.data.routeId && { routeId: parsed.data.routeId }),
    },
    include: {
      route: { include: { originPark: true, destPark: true } },
      bus: true,
      driver: true,
      _count: { select: { tripSeats: true } },
    },
    orderBy: { departureTime: 'asc' },
    take: 200,
  })

  return res.status(200).json(trips.map(serialize))
})

const assignSchema = z.object({
  busId: z.string().uuid(),
  driverId: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().uuid().nullable().optional(),
  ),
})

adminTripsRouter.patch('/trips/:id/assign', async (req, res) => {
  const parsed = assignSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { busId, driverId } = parsed.data

  const trip = await prisma.trip.findUnique({ where: { id: req.params.id }, include: { tripSeats: true } })
  if (!trip) return res.status(404).json({ message: 'Trip not found' })
  if (trip.status === 'cancelled') {
    return res.status(409).json({ message: 'Cannot assign a bus/driver to a cancelled trip' })
  }

  const bus = await prisma.bus.findUnique({ where: { id: busId } })
  if (!bus) return res.status(400).json({ message: 'busId does not match an existing bus' })

  if (driverId) {
    const driver = await prisma.driver.findUnique({ where: { id: driverId } })
    if (!driver) return res.status(400).json({ message: 'driverId does not match an existing driver' })
  }

  const hasExistingSeats = trip.tripSeats.length > 0
  const busChanged = trip.busId !== busId

  // Seats are generated from the bus's capacity + class the first time
  // a bus is assigned (see jobs/generateTrips.ts for why trip_seats
  // aren't created up front). Once seats exist, bookings may already
  // reference specific trip_seats rows by id — swapping to a
  // different bus at that point would leave those bookings pointing
  // at seats that no longer make sense, so it's rejected rather than
  // silently regenerating. Re-assigning the driver (or re-submitting
  // the same bus) is always fine.
  if (hasExistingSeats && busChanged) {
    return res.status(409).json({
      message: 'This trip already has seats generated for its current bus. Reassigning to a different bus is not supported yet.',
    })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTrip = await tx.trip.update({
      where: { id: trip.id },
      data: { busId, driverId: driverId ?? null },
    })

    if (!hasExistingSeats) {
      const seatNumbers = Array.from({ length: bus.capacity }, (_, i) => String(i + 1).padStart(2, '0'))
      await tx.tripSeat.createMany({
        data: seatNumbers.map((seatNumber) => ({ tripId: trip.id, seatNumber, class: bus.class })),
      })
    }

    return updatedTrip
  })

  const full = await prisma.trip.findUniqueOrThrow({
    where: { id: updated.id },
    include: {
      route: { include: { originPark: true, destPark: true } },
      bus: true,
      driver: true,
      _count: { select: { tripSeats: true } },
    },
  })

  return res.status(200).json(serialize(full))
})

adminTripsRouter.post('/trips/:id/cancel', async (req, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } })
  if (!trip) return res.status(404).json({ message: 'Trip not found' })

  if (trip.status === 'cancelled') {
    return res.status(200).json({ message: 'Trip already cancelled', tripId: trip.id })
  }

  const affectedBookings = await prisma.booking.findMany({
    where: { tripId: trip.id, status: { in: ['held', 'reserved_unpaid', 'booked'] } },
  })

  await prisma.$transaction([
    prisma.trip.update({ where: { id: trip.id }, data: { status: 'cancelled' } }),
    ...affectedBookings.map((booking) =>
      prisma.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } }),
    ),
  ])

  // Only 'booked' bookings were actually paid — nothing to refund for
  // a 'reserved_unpaid' (pay-at-park) or 'held' booking.
  const paidBookings = affectedBookings.filter((b) => b.status === 'booked')
  for (const booking of paidBookings) {
    await refundBookingToWallet(booking)
  }

  return res.status(200).json({
    message: 'Trip cancelled',
    tripId: trip.id,
    cancelledBookingCount: affectedBookings.length,
    refundedBookingCount: paidBookings.length,
  })
})

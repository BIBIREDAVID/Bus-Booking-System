import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'

export const adminBookingsRouter = Router()

adminBookingsRouter.use(requireAuth, requireRole('admin'))

function serialize(booking: {
  id: string
  status: string
  paymentMethod: string
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
    status: booking.status,
    paymentMethod: booking.paymentMethod,
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

const listQuerySchema = z.object({
  status: z.enum(['held', 'reserved_unpaid', 'booked', 'cancelled', 'completed']).optional(),
  paymentMethod: z.enum(['wallet', 'squad', 'paystack', 'pay_at_park']).optional(),
  phone: z.string().optional(),
})

adminBookingsRouter.get('/bookings', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Invalid query' })

  const bookings = await prisma.booking.findMany({
    where: {
      ...(parsed.data.status && { status: parsed.data.status }),
      ...(parsed.data.paymentMethod && { paymentMethod: parsed.data.paymentMethod }),
      ...(parsed.data.phone && { user: { phone: { contains: parsed.data.phone } } }),
    },
    include: {
      user: true,
      seat: true,
      boardStop: { include: { park: true } },
      alightStop: { include: { park: true } },
      trip: { include: { bus: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return res.status(200).json(bookings.map(serialize))
})

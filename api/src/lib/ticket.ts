import { prisma } from './prisma'
import { NotFoundError } from './segments'

export async function serializeTicket(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      trip: { include: { bus: true } },
      seat: true,
      boardStop: { include: { park: true } },
      alightStop: { include: { park: true } },
      rating: true,
    },
  })
  if (!booking) throw new NotFoundError('Booking not found')

  return {
    bookingId: booking.id,
    tripId: booking.tripId,
    status: booking.status,
    paymentMethod: booking.paymentMethod,
    amount: booking.amount,
    seatNumber: booking.seat.seatNumber,
    seatClass: booking.class,
    boardParkName: booking.boardStop.park.name,
    alightParkName: booking.alightStop.park.name,
    departureTime: booking.trip.departureTime,
    busPlate: booking.trip.bus?.plate ?? null,
    payAtParkCutoff: booking.payAtParkCutoff,
    createdAt: booking.createdAt,
    rating: booking.rating ? { stars: booking.rating.stars, comment: booking.rating.comment } : null,
  }
}

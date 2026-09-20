import 'dotenv/config'
import { prisma } from '../lib/prisma'

/**
 * Cancels pay-at-park bookings that were never paid before their
 * cutoff. No refund logic needed here (unlike admin trip cancellation)
 * — pay-at-park bookings are unpaid by definition, so there's no money
 * to return. Flipping status to 'cancelled' is what frees the seat:
 * seat-map / hold-seat / booking-creation all compute availability
 * from bookings with status IN ('booked', 'reserved_unpaid'), so a
 * cancelled row simply stops counting.
 */
export async function cancelUnpaidBookings() {
  const result = await prisma.booking.updateMany({
    where: { status: 'reserved_unpaid', payAtParkCutoff: { lt: new Date() } },
    data: { status: 'cancelled' },
  })
  console.log(`[cancelUnpaidBookings] cancelled ${result.count} unpaid booking(s) past cutoff`)
  return result.count
}

if (require.main === module) {
  cancelUnpaidBookings()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[cancelUnpaidBookings] failed', err)
      return prisma.$disconnect().finally(() => process.exit(1))
    })
}

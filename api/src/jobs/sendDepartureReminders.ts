import 'dotenv/config'
import { prisma } from '../lib/prisma'
import { notifyDepartureReminder } from '../lib/notifications'

const REMINDER_HOURS_BEFORE = Number(process.env.DEPARTURE_REMINDER_HOURS ?? 24)

/**
 * Sends a one-time pre-departure reminder to every active (booked or
 * reserved_unpaid) booking whose trip now departs within
 * REMINDER_HOURS_BEFORE and hasn't been reminded yet. `reminderSentAt`
 * is the guard against double-sending — this job can safely run on
 * any interval (same cron mechanism as purgeExpiredHolds /
 * cancelUnpaidBookings — see server.ts) since a booking only ever
 * crosses the threshold once and gets marked immediately after.
 */
export async function sendDepartureReminders() {
  const cutoff = new Date(Date.now() + REMINDER_HOURS_BEFORE * 60 * 60 * 1000)

  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: ['booked', 'reserved_unpaid'] },
      reminderSentAt: null,
      trip: { departureTime: { lte: cutoff, gt: new Date() } },
    },
    select: { id: true },
  })

  let sent = 0
  for (const booking of bookings) {
    try {
      await notifyDepartureReminder(booking.id)
      // Compare-and-swap guard: if two overlapping runs both pick up
      // the same booking, only one wins the update and the other's
      // send is harmless (worst case, one duplicate reminder — the
      // guard here is about steady-state idempotency, not distributed
      // locking of this single-process job).
      await prisma.booking.updateMany({
        where: { id: booking.id, reminderSentAt: null },
        data: { reminderSentAt: new Date() },
      })
      sent++
    } catch (err) {
      console.error(`[sendDepartureReminders] failed for booking ${booking.id}`, err)
    }
  }

  console.log(`[sendDepartureReminders] sent ${sent} reminder(s)`)
  return sent
}

if (require.main === module) {
  sendDepartureReminders()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[sendDepartureReminders] failed', err)
      return prisma.$disconnect().finally(() => process.exit(1))
    })
}

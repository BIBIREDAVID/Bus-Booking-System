import type { AlertType } from '@prisma/client'
import { prisma } from './prisma'
import { sendSms } from './sms'
import { sendEmail } from './email'

/**
 * Everything in this module funnels through sendSms/sendEmail (both
 * console-log stubs for now — see lib/sms.ts and lib/email.ts) so a
 * real provider can be plugged into those two functions later without
 * touching any call site here.
 */
async function notifyUser(user: { phone: string; email: string | null }, subject: string, message: string) {
  await sendSms(user.phone, message).catch((err) => console.error('[notifications] sendSms failed', err))
  if (user.email) {
    await sendEmail(user.email, subject, message).catch((err) => console.error('[notifications] sendEmail failed', err))
  }
}

function formatWhen(iso: Date) {
  return iso.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
}

// ------------------------------------------------------------
// Booking confirmation — fired right after a booking is created,
// regardless of which flow created it (rider self-serve, staff manual
// booking, or a gateway webhook confirming a top-up-and-pay).
// ------------------------------------------------------------

export async function notifyBookingConfirmation(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      seat: true,
      boardStop: { include: { park: true } },
      alightStop: { include: { park: true } },
      trip: true,
    },
  })
  if (!booking) return

  const subject = 'Your BookMyBus booking is confirmed'
  const message =
    `Booking confirmed: ${booking.boardStop.park.name} → ${booking.alightStop.park.name}, ` +
    `seat ${booking.seat.seatNumber}, departs ${formatWhen(booking.trip.departureTime)}. ` +
    `Fare: NGN ${booking.amount}. Booking ref: ${booking.id.slice(0, 8).toUpperCase()}.`

  await notifyUser(booking.user, subject, message)
}

// ------------------------------------------------------------
// Departure reminder — sent by the pre-departure reminder cron job
// (jobs/sendDepartureReminders.ts), not from a request handler.
// ------------------------------------------------------------

export async function notifyDepartureReminder(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      seat: true,
      boardStop: { include: { park: true } },
      alightStop: { include: { park: true } },
      trip: true,
    },
  })
  if (!booking) return

  const subject = 'Upcoming BookMyBus trip reminder'
  const message =
    `Reminder: your trip from ${booking.boardStop.park.name} to ${booking.alightStop.park.name} ` +
    `departs ${formatWhen(booking.trip.departureTime)}. Seat ${booking.seat.seatNumber}. ` +
    `Please arrive 15 minutes early.`

  await notifyUser(booking.user, subject, message)
}

// ------------------------------------------------------------
// Trip alerts — an admin-posted alert (delay/route-change/
// cancellation/holiday-notice) tied to a trip or a whole route.
// Notifies every rider with an active (booked or reserved_unpaid)
// booking on an affected, not-yet-departed trip.
// ------------------------------------------------------------

const ALERT_SUBJECT: Record<AlertType, string> = {
  delay: 'Trip delay notice',
  route_change: 'Route change notice',
  cancellation: 'Trip cancellation notice',
  holiday_notice: 'Holiday schedule notice',
}

export async function notifyTripAlert(alertId: string): Promise<{ notifiedCount: number }> {
  const alert = await prisma.tripAlert.findUnique({ where: { id: alertId } })
  if (!alert) return { notifiedCount: 0 }

  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: ['booked', 'reserved_unpaid'] },
      trip: {
        departureTime: { gt: new Date() },
        ...(alert.tripId ? { id: alert.tripId } : {}),
        ...(alert.routeId ? { routeId: alert.routeId } : {}),
      },
    },
    include: { user: true },
  })

  // A rider can hold multiple affected bookings (e.g. a route-wide
  // alert hitting two of their trips) — notify each rider once.
  const riders = new Map(bookings.map((b) => [b.userId, b.user]))

  const subject = ALERT_SUBJECT[alert.type]
  for (const rider of riders.values()) {
    await notifyUser(rider, subject, alert.message)
  }

  return { notifiedCount: riders.size }
}

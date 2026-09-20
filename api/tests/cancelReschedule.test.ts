import 'dotenv/config'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { signAccessToken } from '../src/lib/jwt'
import { bookWithWallet } from '../src/lib/bookingTransaction'

/**
 * Integration tests against a real Postgres database (same DB used for
 * local dev — see tests/holdSeat.test.ts for the general pattern).
 * These exercise the actual HTTP routes (POST /bookings/:id/cancel,
 * POST /bookings/:id/reschedule) end to end — auth middleware, zod
 * validation, the refund/reschedule transaction, and the response
 * shape — not a mock of any of it.
 *
 * Fixture: a 2-stop route A -> C, one fare segment, a 2-seat bus. Each
 * test creates its own trip(s) so departure-time-relative policy
 * checks (>24h / <24h / <2h) can be set up independently per test.
 */

const app = createApp()
const ONE_HOUR_MS = 60 * 60 * 1000

let parkA: { id: string }
let parkC: { id: string }
let routeId: string
let stopA: { id: string }
let stopC: { id: string }
let busId: string
let userId: string
let otherUserId: string
let authHeader: string

let tripCounter = 0
function futureDeparture(hoursFromNow: number) {
  tripCounter += 1
  return new Date(Date.now() + hoursFromNow * ONE_HOUR_MS + tripCounter * 1000)
}

async function makeTrip(hoursFromNow: number, seatCount = 2) {
  const trip = await prisma.trip.create({
    data: { routeId, busId, status: 'scheduled', departureTime: futureDeparture(hoursFromNow) },
  })
  const seats = await Promise.all(
    Array.from({ length: seatCount }, (_, i) =>
      prisma.tripSeat.create({ data: { tripId: trip.id, seatNumber: String(i + 1).padStart(2, '0'), class: 'standard' } }),
    ),
  )
  return { tripId: trip.id, seatIds: seats.map((s) => s.id) }
}

async function fundWallet(amount: number) {
  await prisma.$executeRaw`INSERT INTO wallets (user_id, balance) VALUES (${userId}::uuid, 0) ON CONFLICT (user_id) DO NOTHING`
  await prisma.wallet.update({ where: { userId }, data: { balance: { increment: amount } } })
}

async function walletBalance() {
  const wallet = await prisma.wallet.findUnique({ where: { userId } })
  return wallet ? Number(wallet.balance) : 0
}

async function makeBookedBooking(tripId: string, seatId: string) {
  return bookWithWallet({
    userId,
    tripId,
    seatId,
    boardStopId: stopA.id,
    alightStopId: stopC.id,
    requireValidHold: false,
  })
}

beforeAll(async () => {
  parkA = await prisma.park.create({ data: { name: 'Test CR Park A', city: 'Lagos', state: 'Lagos' } })
  parkC = await prisma.park.create({ data: { name: 'Test CR Park C', city: 'Benin', state: 'Edo' } })

  const route = await prisma.route.create({ data: { originParkId: parkA.id, destParkId: parkC.id, durationMins: 240 } })
  routeId = route.id

  stopA = await prisma.routeStop.create({ data: { routeId, parkId: parkA.id, stopOrder: 1, isBoardingPoint: true } })
  stopC = await prisma.routeStop.create({ data: { routeId, parkId: parkC.id, stopOrder: 2, isBoardingPoint: true } })

  await prisma.routeSegment.create({
    data: { routeId, fromStopId: stopA.id, toStopId: stopC.id, fareStandard: 5000, fareLuxury: 7000, fareVip: 9000 },
  })

  const bus = await prisma.bus.create({ data: { plate: `TEST-CR-${Date.now()}`, capacity: 4, class: 'standard' } })
  busId = bus.id

  const user = await prisma.user.create({ data: { phone: `+1556${Date.now()}`.slice(0, 15), role: 'rider' } })
  userId = user.id
  authHeader = `Bearer ${signAccessToken({ sub: user.id, role: 'rider', homeParkId: null })}`

  const other = await prisma.user.create({ data: { phone: `+1557${Date.now()}`.slice(0, 15), role: 'rider' } })
  otherUserId = other.id
})

afterAll(async () => {
  await prisma.bookingRating.deleteMany({ where: { booking: { userId: { in: [userId, otherUserId] } } } })
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
  await prisma.booking.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
  await prisma.wallet.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
  await prisma.trip.deleteMany({ where: { routeId } })
  await prisma.bus.delete({ where: { id: busId } })
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
  await prisma.route.delete({ where: { id: routeId } }) // cascades route_stops, route_segments
  await prisma.park.deleteMany({ where: { id: { in: [parkA.id, parkC.id] } } })
  await prisma.$disconnect()
})

afterEach(async () => {
  await prisma.bookingRating.deleteMany({ where: { booking: { userId: { in: [userId, otherUserId] } } } })
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
  await prisma.booking.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
  await prisma.wallet.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
  await prisma.tripSeat.deleteMany({ where: { trip: { routeId } } })
  await prisma.trip.deleteMany({ where: { routeId } })
})

describe('POST /bookings/:id/cancel', () => {
  it('refunds 100% to wallet when departure is more than 24h away', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(10_000)
    const booking = await makeBookedBooking(tripId, seatIds[0])
    const balanceAfterBooking = await walletBalance()
    expect(balanceAfterBooking).toBe(5_000) // 10,000 - 5,000 fare

    const res = await request(app).post(`/bookings/${booking.id}/cancel`).set('Authorization', authHeader)

    expect(res.status).toBe(200)
    expect(res.body.refunded).toBe(true)
    expect(res.body.ticket.status).toBe('cancelled')

    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(fresh.status).toBe('cancelled')
    expect(await walletBalance()).toBe(10_000) // fully refunded

    const refundTxn = await prisma.walletTransaction.findFirst({ where: { bookingId: booking.id, type: 'refund' } })
    expect(refundTxn).not.toBeNull()
    expect(Number(refundTxn!.amount)).toBe(5_000)
  })

  it('does not refund when departure is less than 24h away', async () => {
    const { tripId, seatIds } = await makeTrip(5)
    await fundWallet(10_000)
    const booking = await makeBookedBooking(tripId, seatIds[0])
    const balanceAfterBooking = await walletBalance()

    const res = await request(app).post(`/bookings/${booking.id}/cancel`).set('Authorization', authHeader)

    expect(res.status).toBe(200)
    expect(res.body.refunded).toBe(false)
    expect(res.body.ticket.status).toBe('cancelled')

    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(fresh.status).toBe('cancelled')
    expect(await walletBalance()).toBe(balanceAfterBooking) // unchanged, no refund

    const refundTxn = await prisma.walletTransaction.findFirst({ where: { bookingId: booking.id, type: 'refund' } })
    expect(refundTxn).toBeNull()
  })

  it('never refunds a reserved_unpaid (pay-at-park) booking, even more than 24h out', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    const booking = await prisma.booking.create({
      data: {
        userId,
        tripId,
        seatId: seatIds[0],
        boardStopId: stopA.id,
        alightStopId: stopC.id,
        class: 'standard',
        paymentMethod: 'pay_at_park',
        amount: 5000,
        status: 'reserved_unpaid',
        payAtParkCutoff: futureDeparture(46),
      },
    })

    const res = await request(app).post(`/bookings/${booking.id}/cancel`).set('Authorization', authHeader)

    expect(res.status).toBe(200)
    expect(res.body.refunded).toBe(false)
    expect(await walletBalance()).toBe(0)
  })

  it('rejects cancelling an already-cancelled booking (no double refund)', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(10_000)
    const booking = await makeBookedBooking(tripId, seatIds[0])

    const first = await request(app).post(`/bookings/${booking.id}/cancel`).set('Authorization', authHeader)
    expect(first.status).toBe(200)
    expect(await walletBalance()).toBe(10_000)

    const second = await request(app).post(`/bookings/${booking.id}/cancel`).set('Authorization', authHeader)
    expect(second.status).toBe(400)

    // Balance must still reflect exactly one refund, not two.
    expect(await walletBalance()).toBe(10_000)
    const refundTxns = await prisma.walletTransaction.findMany({ where: { bookingId: booking.id, type: 'refund' } })
    expect(refundTxns).toHaveLength(1)
  })

  it("404s cancelling another rider's booking", async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(10_000)
    const booking = await makeBookedBooking(tripId, seatIds[0])

    const otherAuth = `Bearer ${signAccessToken({ sub: otherUserId, role: 'rider', homeParkId: null })}`
    const res = await request(app).post(`/bookings/${booking.id}/cancel`).set('Authorization', otherAuth)

    expect(res.status).toBe(404)
    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(fresh.status).toBe('booked') // untouched
  })
})

describe('POST /bookings/:id/reschedule', () => {
  it('books the new segment, releases the old booking, and debits the new fare', async () => {
    const original = await makeTrip(10)
    const target = await makeTrip(20)
    await fundWallet(10_000)
    const booking = await makeBookedBooking(original.tripId, original.seatIds[0])
    expect(await walletBalance()).toBe(5_000)

    const res = await request(app)
      .post(`/bookings/${booking.id}/reschedule`)
      .set('Authorization', authHeader)
      .send({ tripId: target.tripId, seatId: target.seatIds[0], boardStopId: stopA.id, alightStopId: stopC.id })

    expect(res.status).toBe(200)
    expect(res.body.ticket.status).toBe('booked')
    expect(res.body.ticket.bookingId).not.toBe(booking.id)

    const oldBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(oldBooking.status).toBe('cancelled')

    const newBooking = await prisma.booking.findUniqueOrThrow({ where: { id: res.body.ticket.bookingId } })
    expect(newBooking.status).toBe('booked')
    expect(newBooking.tripId).toBe(target.tripId)
    expect(newBooking.seatId).toBe(target.seatIds[0])

    // Debited for the new fare on top of the original — reschedule
    // does not refund the old booking, it just books a new one.
    expect(await walletBalance()).toBe(0)
  })

  it('rejects rescheduling within 2 hours of the original departure', async () => {
    const original = await makeTrip(1)
    const target = await makeTrip(20)
    await fundWallet(10_000)
    const booking = await makeBookedBooking(original.tripId, original.seatIds[0])

    const res = await request(app)
      .post(`/bookings/${booking.id}/reschedule`)
      .set('Authorization', authHeader)
      .send({ tripId: target.tripId, seatId: target.seatIds[0], boardStopId: stopA.id, alightStopId: stopC.id })

    expect(res.status).toBe(400)
    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(fresh.status).toBe('booked') // untouched
    expect(await walletBalance()).toBe(5_000) // no new debit
  })

  it('rejects rescheduling a booking that is not currently booked (e.g. already cancelled)', async () => {
    const original = await makeTrip(10)
    const target = await makeTrip(20)
    await fundWallet(10_000)
    const booking = await makeBookedBooking(original.tripId, original.seatIds[0])
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } })

    const res = await request(app)
      .post(`/bookings/${booking.id}/reschedule`)
      .set('Authorization', authHeader)
      .send({ tripId: target.tripId, seatId: target.seatIds[0], boardStopId: stopA.id, alightStopId: stopC.id })

    expect(res.status).toBe(400)
  })

  it('leaves the original booking untouched when the target seat is unavailable', async () => {
    const original = await makeTrip(10)
    const target = await makeTrip(20)
    await fundWallet(20_000)
    const booking = await makeBookedBooking(original.tripId, original.seatIds[0])

    // Someone else already holds the target seat for the exact same segment.
    await prisma.booking.create({
      data: {
        userId: otherUserId,
        tripId: target.tripId,
        seatId: target.seatIds[0],
        boardStopId: stopA.id,
        alightStopId: stopC.id,
        class: 'standard',
        paymentMethod: 'wallet',
        amount: 5000,
        status: 'booked',
      },
    })

    const res = await request(app)
      .post(`/bookings/${booking.id}/reschedule`)
      .set('Authorization', authHeader)
      .send({ tripId: target.tripId, seatId: target.seatIds[0], boardStopId: stopA.id, alightStopId: stopC.id })

    expect(res.status).toBe(409)

    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(fresh.status).toBe('booked') // still the original, untouched
    expect(await walletBalance()).toBe(15_000) // only the original fare was ever debited
  })

  it('leaves the original booking untouched when the wallet cannot cover the new fare', async () => {
    const original = await makeTrip(10)
    const target = await makeTrip(20)
    await fundWallet(5_000) // exactly enough for the original booking, nothing left over
    const booking = await makeBookedBooking(original.tripId, original.seatIds[0])
    expect(await walletBalance()).toBe(0)

    const res = await request(app)
      .post(`/bookings/${booking.id}/reschedule`)
      .set('Authorization', authHeader)
      .send({ tripId: target.tripId, seatId: target.seatIds[0], boardStopId: stopA.id, alightStopId: stopC.id })

    expect(res.status).toBe(402)

    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(fresh.status).toBe('booked') // still the original, untouched
    expect(await walletBalance()).toBe(0)
  })
})

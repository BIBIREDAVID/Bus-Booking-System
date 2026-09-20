import 'dotenv/config'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { signAccessToken } from '../src/lib/jwt'

/**
 * Integration tests against a real Postgres database (same DB used for
 * local dev — see tests/holdSeat.test.ts for the general pattern),
 * driving the actual HTTP routes end to end for the park-staff
 * dashboard (manual booking, pending payments, check-in) and the
 * admin trip-cancellation refund wiring.
 *
 * Fixture: two parks (Origin, Dest) on one route, and a THIRD park
 * (Elsewhere) with no route of its own — used only as another staff
 * member's home park, to prove cross-park scoping is enforced at the
 * API layer (403), not just hidden in the UI.
 */

const app = createApp()
const ONE_HOUR_MS = 60 * 60 * 1000

let parkOrigin: { id: string }
let parkDest: { id: string }
let parkElsewhere: { id: string }
let routeId: string
let stopOrigin: { id: string }
let stopDest: { id: string }
let busId: string

let adminUserId: string
let adminAuth: string
let staffHomeId: string
let staffHomeAuth: string
let staffOtherId: string
let staffOtherAuth: string
let riderUserId: string

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

async function fundWallet(forUserId: string, amount: number) {
  await prisma.$executeRaw`INSERT INTO wallets (user_id, balance) VALUES (${forUserId}::uuid, 0) ON CONFLICT (user_id) DO NOTHING`
  await prisma.wallet.update({ where: { userId: forUserId }, data: { balance: { increment: amount } } })
}

async function walletBalance(forUserId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId: forUserId } })
  return wallet ? Number(wallet.balance) : 0
}

let allTestUserIds: string[] = []

beforeAll(async () => {
  parkOrigin = await prisma.park.create({ data: { name: 'Test SA Origin', city: 'Lagos', state: 'Lagos' } })
  parkDest = await prisma.park.create({ data: { name: 'Test SA Dest', city: 'Benin', state: 'Edo' } })
  parkElsewhere = await prisma.park.create({ data: { name: 'Test SA Elsewhere', city: 'Ibadan', state: 'Oyo' } })

  const route = await prisma.route.create({ data: { originParkId: parkOrigin.id, destParkId: parkDest.id, durationMins: 240 } })
  routeId = route.id

  stopOrigin = await prisma.routeStop.create({ data: { routeId, parkId: parkOrigin.id, stopOrder: 1, isBoardingPoint: true } })
  stopDest = await prisma.routeStop.create({ data: { routeId, parkId: parkDest.id, stopOrder: 2, isBoardingPoint: true } })

  await prisma.routeSegment.create({
    data: { routeId, fromStopId: stopOrigin.id, toStopId: stopDest.id, fareStandard: 5000, fareLuxury: 7000, fareVip: 9000 },
  })

  const bus = await prisma.bus.create({ data: { plate: `TEST-SA-${Date.now()}`, capacity: 4, class: 'standard' } })
  busId = bus.id

  const admin = await prisma.user.create({ data: { phone: `+1560${Date.now()}`.slice(0, 15), role: 'admin' } })
  adminUserId = admin.id
  adminAuth = `Bearer ${signAccessToken({ sub: admin.id, role: 'admin', homeParkId: null })}`

  const staffHome = await prisma.user.create({
    data: { phone: `+1561${Date.now()}`.slice(0, 15), role: 'park_staff', homeParkId: parkOrigin.id },
  })
  staffHomeId = staffHome.id
  staffHomeAuth = `Bearer ${signAccessToken({ sub: staffHome.id, role: 'park_staff', homeParkId: parkOrigin.id })}`

  const staffOther = await prisma.user.create({
    data: { phone: `+1562${Date.now()}`.slice(0, 15), role: 'park_staff', homeParkId: parkElsewhere.id },
  })
  staffOtherId = staffOther.id
  staffOtherAuth = `Bearer ${signAccessToken({ sub: staffOther.id, role: 'park_staff', homeParkId: parkElsewhere.id })}`

  const rider = await prisma.user.create({ data: { phone: `+1563${Date.now()}`.slice(0, 15), role: 'rider' } })
  riderUserId = rider.id

  allTestUserIds = [adminUserId, staffHomeId, staffOtherId, riderUserId]
})

afterAll(async () => {
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: allTestUserIds } } })
  await prisma.booking.deleteMany({ where: { OR: [{ userId: { in: allTestUserIds } }, { trip: { routeId } }] } })
  await prisma.wallet.deleteMany({ where: { userId: { in: allTestUserIds } } })
  await prisma.trip.deleteMany({ where: { routeId } })
  await prisma.bus.delete({ where: { id: busId } })
  await prisma.user.deleteMany({ where: { id: { in: allTestUserIds } } })
  // Manual booking creates a passenger user per unique phone — sweep
  // up anything else this file's phone prefixes (+156x) produced.
  await prisma.user.deleteMany({ where: { phone: { startsWith: '+1564' } } })
  await prisma.route.delete({ where: { id: routeId } }) // cascades route_stops, route_segments
  await prisma.park.deleteMany({ where: { id: { in: [parkOrigin.id, parkDest.id, parkElsewhere.id] } } })
  await prisma.$disconnect()
})

afterEach(async () => {
  // Manual booking mints a fresh passenger per unique phone, so the
  // refundable/chargeable user set grows during the run — recompute it
  // from bookings on this route rather than just the fixed fixtures.
  const passengerIds = (await prisma.booking.findMany({ where: { trip: { routeId } }, select: { userId: true } })).map(
    (b) => b.userId,
  )
  const walletUserIds = [...new Set([...allTestUserIds, ...passengerIds])]

  await prisma.walletTransaction.deleteMany({ where: { userId: { in: walletUserIds } } })
  await prisma.booking.deleteMany({ where: { trip: { routeId } } })
  await prisma.wallet.deleteMany({ where: { userId: { in: walletUserIds } } })
  await prisma.user.deleteMany({ where: { phone: { startsWith: '+1564' } } })
  await prisma.seatHold.deleteMany({ where: { trip: { routeId } } })
  await prisma.tripSeat.deleteMany({ where: { trip: { routeId } } })
  await prisma.trip.deleteMany({ where: { routeId } })
})

describe('POST /staff/bookings/manual', () => {
  it('creates a new passenger and a pay-at-park booking', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    const passengerPhone = `+15641${Date.now()}`.slice(0, 15)

    const res = await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffHomeAuth)
      .send({
        tripId,
        seatId: seatIds[0],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: 'Walk-in Passenger',
        passengerPhone,
      })

    expect(res.status).toBe(201)
    expect(res.body.ticket.status).toBe('reserved_unpaid')

    const passenger = await prisma.user.findUniqueOrThrow({ where: { phone: passengerPhone } })
    expect(passenger.role).toBe('rider')
    expect(passenger.name).toBe('Walk-in Passenger')

    const booking = await prisma.booking.findFirstOrThrow({ where: { tripId, seatId: seatIds[0] } })
    expect(booking.performedBy).toBe(staffHomeId)
    expect(booking.userId).toBe(passenger.id)
  })

  it("charges an existing passenger's wallet when paymentMethod is 'wallet'", async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(riderUserId, 10_000)
    const rider = await prisma.user.findUniqueOrThrow({ where: { id: riderUserId } })

    const res = await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffHomeAuth)
      .send({
        tripId,
        seatId: seatIds[0],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: rider.name ?? 'Existing Rider',
        passengerPhone: rider.phone,
        paymentMethod: 'wallet',
      })

    expect(res.status).toBe(201)
    expect(res.body.ticket.status).toBe('booked')
    expect(await walletBalance(riderUserId)).toBe(5_000)
  })

  it("rejects with 402 when the passenger's wallet cannot cover the fare, and books nothing", async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(riderUserId, 1_000)
    const rider = await prisma.user.findUniqueOrThrow({ where: { id: riderUserId } })

    const res = await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffHomeAuth)
      .send({
        tripId,
        seatId: seatIds[0],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: rider.name ?? 'Existing Rider',
        passengerPhone: rider.phone,
        paymentMethod: 'wallet',
      })

    expect(res.status).toBe(402)
    expect(await walletBalance(riderUserId)).toBe(1_000)
    const bookings = await prisma.booking.findMany({ where: { tripId, seatId: seatIds[0] } })
    expect(bookings).toHaveLength(0)
  })

  it('rejects booking a trip that does not depart from the staff member\'s own park', async () => {
    const { tripId, seatIds } = await makeTrip(48) // this route originates at parkOrigin, not parkElsewhere

    const res = await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffOtherAuth)
      .send({
        tripId,
        seatId: seatIds[0],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: 'Sneaky',
        passengerPhone: `+15642${Date.now()}`.slice(0, 15),
      })

    expect(res.status).toBe(403)
    const bookings = await prisma.booking.findMany({ where: { tripId, seatId: seatIds[0] } })
    expect(bookings).toHaveLength(0)
  })
})

describe('GET /staff/bookings/pending-payments and POST /:id/mark-paid', () => {
  it('lists only reserved_unpaid bookings boarding at the staff member\'s own park', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    const passengerPhone = `+15643${Date.now()}`.slice(0, 15)

    const created = await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffHomeAuth)
      .send({
        tripId,
        seatId: seatIds[0],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: 'Pending Passenger',
        passengerPhone,
      })
    const bookingId = created.body.ticket.bookingId

    const homeList = await request(app).get('/staff/bookings/pending-payments').set('Authorization', staffHomeAuth)
    expect(homeList.status).toBe(200)
    expect(homeList.body.some((b: { id: string }) => b.id === bookingId)).toBe(true)

    const otherList = await request(app).get('/staff/bookings/pending-payments').set('Authorization', staffOtherAuth)
    expect(otherList.body.some((b: { id: string }) => b.id === bookingId)).toBe(false)
  })

  it('marks a pending booking as paid, and it drops off the pending list', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    const passengerPhone = `+15644${Date.now()}`.slice(0, 15)

    const created = await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffHomeAuth)
      .send({
        tripId,
        seatId: seatIds[0],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: 'To Be Paid',
        passengerPhone,
      })
    const bookingId = created.body.ticket.bookingId

    const res = await request(app).post(`/staff/bookings/${bookingId}/mark-paid`).set('Authorization', staffHomeAuth)
    expect(res.status).toBe(200)
    expect(res.body.ticket.status).toBe('booked')

    const list = await request(app).get('/staff/bookings/pending-payments').set('Authorization', staffHomeAuth)
    expect(list.body.some((b: { id: string }) => b.id === bookingId)).toBe(false)
  })

  it('rejects marking an already-booked booking as paid', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(riderUserId, 10_000)
    const rider = await prisma.user.findUniqueOrThrow({ where: { id: riderUserId } })

    const created = await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffHomeAuth)
      .send({
        tripId,
        seatId: seatIds[0],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: rider.name ?? 'Existing Rider',
        passengerPhone: rider.phone,
        paymentMethod: 'wallet',
      })
    const bookingId = created.body.ticket.bookingId

    const res = await request(app).post(`/staff/bookings/${bookingId}/mark-paid`).set('Authorization', staffHomeAuth)
    expect(res.status).toBe(400)
  })

  it('rejects marking a booking boarding at a different park as paid', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    const passengerPhone = `+15645${Date.now()}`.slice(0, 15)

    const created = await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffHomeAuth)
      .send({
        tripId,
        seatId: seatIds[0],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: 'Cross Park',
        passengerPhone,
      })
    const bookingId = created.body.ticket.bookingId

    const res = await request(app).post(`/staff/bookings/${bookingId}/mark-paid`).set('Authorization', staffOtherAuth)
    expect(res.status).toBe(403)

    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })
    expect(fresh.status).toBe('reserved_unpaid') // untouched
  })
})

describe('GET /staff/checkin/search and POST /:id/board', () => {
  async function bookAndPay() {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(riderUserId, 10_000)
    const rider = await prisma.user.findUniqueOrThrow({ where: { id: riderUserId } })
    const created = await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffHomeAuth)
      .send({
        tripId,
        seatId: seatIds[0],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: rider.name ?? 'Existing Rider',
        passengerPhone: rider.phone,
        paymentMethod: 'wallet',
      })
    return { tripId, bookingId: created.body.ticket.bookingId as string, riderPhone: rider.phone }
  }

  it('finds a booked passenger by phone number', async () => {
    const { bookingId, riderPhone } = await bookAndPay()

    const res = await request(app)
      .get('/staff/checkin/search')
      .query({ query: riderPhone })
      .set('Authorization', staffHomeAuth)

    expect(res.status).toBe(200)
    expect(res.body.some((b: { id: string }) => b.id === bookingId)).toBe(true)
  })

  it('finds a booked passenger by booking id, as a QR scan would', async () => {
    const { bookingId } = await bookAndPay()

    const res = await request(app)
      .get('/staff/checkin/search')
      .query({ query: bookingId })
      .set('Authorization', staffHomeAuth)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe(bookingId)
  })

  it('does not surface a booking to a different park\'s staff', async () => {
    const { bookingId } = await bookAndPay()

    const res = await request(app)
      .get('/staff/checkin/search')
      .query({ query: bookingId })
      .set('Authorization', staffOtherAuth)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })

  it('checks in a booked passenger, and a second check-in is idempotent', async () => {
    const { bookingId } = await bookAndPay()

    const first = await request(app).post(`/staff/checkin/${bookingId}/board`).set('Authorization', staffHomeAuth)
    expect(first.status).toBe(200)
    expect(first.body.boarded).toBe(true)
    const firstBoardedAt = first.body.boardedAt

    const second = await request(app).post(`/staff/checkin/${bookingId}/board`).set('Authorization', staffHomeAuth)
    expect(second.status).toBe(200)
    expect(second.body.boarded).toBe(true)
    expect(second.body.boardedAt).toBe(firstBoardedAt) // not re-stamped
  })

  it('rejects checking in a booking that has not been paid', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    const passengerPhone = `+15646${Date.now()}`.slice(0, 15)
    const created = await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffHomeAuth)
      .send({
        tripId,
        seatId: seatIds[0],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: 'Unpaid',
        passengerPhone,
      })
    const bookingId = created.body.ticket.bookingId

    const res = await request(app).post(`/staff/checkin/${bookingId}/board`).set('Authorization', staffHomeAuth)
    expect(res.status).toBe(400)
  })

  it('rejects checking in a passenger boarding at a different park', async () => {
    const { bookingId } = await bookAndPay()

    const res = await request(app).post(`/staff/checkin/${bookingId}/board`).set('Authorization', staffOtherAuth)
    expect(res.status).toBe(403)

    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })
    expect(fresh.boardedAt).toBeNull() // untouched
  })
})

describe('POST /admin/trips/:id/cancel (refund wiring)', () => {
  it('cancels every affected booking and refunds only the paid ones', async () => {
    const { tripId, seatIds } = await makeTrip(48, 3)
    await fundWallet(riderUserId, 10_000)
    const rider = await prisma.user.findUniqueOrThrow({ where: { id: riderUserId } })

    // Seat 1: paid via staff (wallet) -> should be refunded.
    const paid = await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffHomeAuth)
      .send({
        tripId,
        seatId: seatIds[0],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: rider.name ?? 'Existing Rider',
        passengerPhone: rider.phone,
        paymentMethod: 'wallet',
      })
    expect(paid.status).toBe(201)
    expect(await walletBalance(riderUserId)).toBe(5_000)

    // Seat 2: pay-at-park, never paid -> should NOT be refunded.
    const unpaid = await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffHomeAuth)
      .send({
        tripId,
        seatId: seatIds[1],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: 'Unpaid Passenger',
        passengerPhone: `+15647${Date.now()}`.slice(0, 15),
      })
    expect(unpaid.status).toBe(201)

    const res = await request(app).post(`/admin/trips/${tripId}/cancel`).set('Authorization', adminAuth)

    expect(res.status).toBe(200)
    expect(res.body.cancelledBookingCount).toBe(2)
    expect(res.body.refundedBookingCount).toBe(1)

    const paidFresh = await prisma.booking.findUniqueOrThrow({ where: { id: paid.body.ticket.bookingId } })
    expect(paidFresh.status).toBe('cancelled')
    const unpaidFresh = await prisma.booking.findUniqueOrThrow({ where: { id: unpaid.body.ticket.bookingId } })
    expect(unpaidFresh.status).toBe('cancelled')

    // Only the paid booking's fare came back.
    expect(await walletBalance(riderUserId)).toBe(10_000)
    const refundTxns = await prisma.walletTransaction.findMany({ where: { userId: riderUserId, type: 'refund' } })
    expect(refundTxns).toHaveLength(1)
    expect(Number(refundTxns[0].amount)).toBe(5_000)

    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })
    expect(trip.status).toBe('cancelled')
  })

  it('is idempotent: cancelling an already-cancelled trip does not refund twice', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(riderUserId, 10_000)
    const rider = await prisma.user.findUniqueOrThrow({ where: { id: riderUserId } })

    await request(app)
      .post('/staff/bookings/manual')
      .set('Authorization', staffHomeAuth)
      .send({
        tripId,
        seatId: seatIds[0],
        boardStopId: stopOrigin.id,
        alightStopId: stopDest.id,
        passengerName: rider.name ?? 'Existing Rider',
        passengerPhone: rider.phone,
        paymentMethod: 'wallet',
      })

    const first = await request(app).post(`/admin/trips/${tripId}/cancel`).set('Authorization', adminAuth)
    expect(first.status).toBe(200)
    expect(await walletBalance(riderUserId)).toBe(10_000)

    const second = await request(app).post(`/admin/trips/${tripId}/cancel`).set('Authorization', adminAuth)
    expect(second.status).toBe(200)
    expect(second.body.message).toMatch(/already cancelled/i)

    expect(await walletBalance(riderUserId)).toBe(10_000) // unchanged — not refunded twice
    const refundTxns = await prisma.walletTransaction.findMany({ where: { userId: riderUserId, type: 'refund' } })
    expect(refundTxns).toHaveLength(1)
  })

  it('rejects a non-admin (park staff) from cancelling a trip', async () => {
    const { tripId } = await makeTrip(48)

    const res = await request(app).post(`/admin/trips/${tripId}/cancel`).set('Authorization', staffHomeAuth)

    expect(res.status).toBe(403)
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })
    expect(trip.status).toBe('scheduled') // untouched
  })
})

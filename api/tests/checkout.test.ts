import 'dotenv/config'
import crypto from 'node:crypto'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { signAccessToken } from '../src/lib/jwt'

/**
 * Integration tests against a real Postgres database (same DB used for
 * local dev — see tests/holdSeat.test.ts for the general pattern),
 * driving the actual HTTP routes end to end: POST /bookings/hold,
 * /pay-with-wallet, /pay-at-park, /top-up-and-pay, and the webhook at
 * POST /payments/webhook/paystack (signature verification included —
 * no shortcut through confirmPaymentIntentByReference directly).
 *
 * The webhook-confirmed top-up-and-pay path gets the most coverage:
 * it's async (the booking only happens once the gateway calls back,
 * arbitrarily later), and has to be safe against webhook retries and
 * against the original seat hold having expired by the time the
 * webhook arrives.
 */

const app = createApp()
const ONE_HOUR_MS = 60 * 60 * 1000
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!

// supertest/superagent will re-serialize a Buffer body into
// `{"type":"Buffer","data":[...]}` when Content-Type is
// application/json (verified empirically) — sending the raw JSON
// *string* instead, with Content-Type set explicitly, is what
// actually reaches Express unmodified as the same bytes the HMAC
// below is computed over. This matters: signing anything other than
// the literal bytes Express hands to express.raw() would make every
// signature check fail regardless of whether the production code is
// correct.
function signPaystackBody(rawBody: string) {
  return crypto.createHmac('sha512', PAYSTACK_SECRET).update(Buffer.from(rawBody)).digest('hex')
}

function paystackSuccessPayload(reference: string) {
  return JSON.stringify({ event: 'charge.success', data: { reference, status: 'success' } })
}

async function postWebhook(rawBody: string, signature: string) {
  return request(app)
    .post('/payments/webhook/paystack')
    .set('Content-Type', 'application/json')
    .set('x-paystack-signature', signature)
    .send(rawBody)
}

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

async function fundWallet(amount: number, forUserId = userId) {
  await prisma.$executeRaw`INSERT INTO wallets (user_id, balance) VALUES (${forUserId}::uuid, 0) ON CONFLICT (user_id) DO NOTHING`
  await prisma.wallet.update({ where: { userId: forUserId }, data: { balance: { increment: amount } } })
}

async function walletBalance(forUserId = userId) {
  const wallet = await prisma.wallet.findUnique({ where: { userId: forUserId } })
  return wallet ? Number(wallet.balance) : 0
}

async function placeHold(tripId: string, seatId: string) {
  const res = await request(app)
    .post('/bookings/hold')
    .set('Authorization', authHeader)
    .send({ tripId, seatId, boardStopId: stopA.id, alightStopId: stopC.id })
  expect(res.status).toBe(201)
  return res.body.holdId as string
}

beforeAll(async () => {
  parkA = await prisma.park.create({ data: { name: 'Test CO Park A', city: 'Lagos', state: 'Lagos' } })
  parkC = await prisma.park.create({ data: { name: 'Test CO Park C', city: 'Benin', state: 'Edo' } })

  const route = await prisma.route.create({ data: { originParkId: parkA.id, destParkId: parkC.id, durationMins: 240 } })
  routeId = route.id

  stopA = await prisma.routeStop.create({ data: { routeId, parkId: parkA.id, stopOrder: 1, isBoardingPoint: true } })
  stopC = await prisma.routeStop.create({ data: { routeId, parkId: parkC.id, stopOrder: 2, isBoardingPoint: true } })

  await prisma.routeSegment.create({
    data: { routeId, fromStopId: stopA.id, toStopId: stopC.id, fareStandard: 5000, fareLuxury: 7000, fareVip: 9000 },
  })

  const bus = await prisma.bus.create({ data: { plate: `TEST-CO-${Date.now()}`, capacity: 4, class: 'standard' } })
  busId = bus.id

  const user = await prisma.user.create({ data: { phone: `+1558${Date.now()}`.slice(0, 15), role: 'rider' } })
  userId = user.id
  authHeader = `Bearer ${signAccessToken({ sub: user.id, role: 'rider', homeParkId: null })}`

  const other = await prisma.user.create({ data: { phone: `+1559${Date.now()}`.slice(0, 15), role: 'rider' } })
  otherUserId = other.id
})

afterAll(async () => {
  await prisma.paymentIntent.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
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
  await prisma.paymentIntent.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
  await prisma.booking.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
  await prisma.wallet.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
  await prisma.seatHold.deleteMany({ where: { trip: { routeId } } })
  await prisma.tripSeat.deleteMany({ where: { trip: { routeId } } })
  await prisma.trip.deleteMany({ where: { routeId } })
})

describe('POST /bookings/pay-with-wallet', () => {
  it('books the seat and debits the wallet when balance covers the fare', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(10_000)
    const holdId = await placeHold(tripId, seatIds[0])

    const res = await request(app).post('/bookings/pay-with-wallet').set('Authorization', authHeader).send({ holdId })

    expect(res.status).toBe(201)
    expect(res.body.ticket.status).toBe('booked')
    expect(await walletBalance()).toBe(5_000)

    const hold = await prisma.seatHold.findUnique({ where: { id: holdId } })
    expect(hold).toBeNull() // consumed
  })

  it('rejects with 402 and leaves the hold intact when the balance is insufficient', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(1_000) // less than the 5,000 fare
    const holdId = await placeHold(tripId, seatIds[0])

    const res = await request(app).post('/bookings/pay-with-wallet').set('Authorization', authHeader).send({ holdId })

    expect(res.status).toBe(402)
    expect(await walletBalance()).toBe(1_000) // untouched

    // Failure rolled back the whole transaction, including the hold
    // deletion reserveSeatWithinTx would otherwise have done.
    const hold = await prisma.seatHold.findUnique({ where: { id: holdId } })
    expect(hold).not.toBeNull()

    const bookings = await prisma.booking.findMany({ where: { tripId } })
    expect(bookings).toHaveLength(0)
  })

  it('rejects with 410 once the hold has expired', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(10_000)
    const holdId = await placeHold(tripId, seatIds[0])
    await prisma.seatHold.update({ where: { id: holdId }, data: { expiresAt: new Date(Date.now() - 1000) } })

    const res = await request(app).post('/bookings/pay-with-wallet').set('Authorization', authHeader).send({ holdId })

    expect(res.status).toBe(410)
    expect(await walletBalance()).toBe(10_000)
  })

  it("404s paying with another rider's hold", async () => {
    const { tripId, seatIds } = await makeTrip(48)
    const holdId = await placeHold(tripId, seatIds[0])

    const otherAuth = `Bearer ${signAccessToken({ sub: otherUserId, role: 'rider', homeParkId: null })}`
    const res = await request(app).post('/bookings/pay-with-wallet').set('Authorization', otherAuth).send({ holdId })

    expect(res.status).toBe(404)
  })
})

describe('POST /bookings/pay-at-park', () => {
  it('reserves the seat unpaid with a cutoff 2 hours before departure', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    const holdId = await placeHold(tripId, seatIds[0])

    const res = await request(app).post('/bookings/pay-at-park').set('Authorization', authHeader).send({ holdId })

    expect(res.status).toBe(201)
    expect(res.body.ticket.status).toBe('reserved_unpaid')
    expect(res.body.ticket.payAtParkCutoff).not.toBeNull()

    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })
    const cutoff = new Date(res.body.ticket.payAtParkCutoff)
    expect(trip.departureTime.getTime() - cutoff.getTime()).toBe(2 * ONE_HOUR_MS)

    // Never touches the wallet — nothing was paid.
    expect(await walletBalance()).toBe(0)
  })

  it('rejects pay-at-park inside the 2-hour cutoff', async () => {
    const { tripId, seatIds } = await makeTrip(1)
    const holdId = await placeHold(tripId, seatIds[0])

    const res = await request(app).post('/bookings/pay-at-park').set('Authorization', authHeader).send({ holdId })

    expect(res.status).toBe(400)
    const bookings = await prisma.booking.findMany({ where: { tripId } })
    expect(bookings).toHaveLength(0)
  })
})

describe('POST /bookings/top-up-and-pay', () => {
  it('initiates a gateway payment for exactly the shortfall', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(2_000) // fare is 5,000 -> shortfall 3,000
    const holdId = await placeHold(tripId, seatIds[0])

    const res = await request(app)
      .post('/bookings/top-up-and-pay')
      .set('Authorization', authHeader)
      .send({ holdId, provider: 'paystack' })

    expect(res.status).toBe(201)
    expect(res.body.shortfall).toBe(3_000)
    expect(res.body.reference).toBeTruthy()

    const intent = await prisma.paymentIntent.findUnique({ where: { providerReference: res.body.reference } })
    expect(intent).not.toBeNull()
    expect(intent!.status).toBe('pending')
    expect(Number(intent!.amount)).toBe(3_000)
    expect(intent!.tripId).toBe(tripId)
  })

  it('rejects when the wallet already covers the fare', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(10_000)
    const holdId = await placeHold(tripId, seatIds[0])

    const res = await request(app)
      .post('/bookings/top-up-and-pay')
      .set('Authorization', authHeader)
      .send({ holdId, provider: 'paystack' })

    expect(res.status).toBe(400)
  })
})

describe('POST /payments/webhook/paystack (top-up-and-pay confirmation)', () => {
  it('credits the wallet and completes the booking on a genuinely signed success event', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(2_000)
    const holdId = await placeHold(tripId, seatIds[0])

    const topUp = await request(app)
      .post('/bookings/top-up-and-pay')
      .set('Authorization', authHeader)
      .send({ holdId, provider: 'paystack' })
    const { reference } = topUp.body

    const rawBody = paystackSuccessPayload(reference)
    const res = await postWebhook(rawBody, signPaystackBody(rawBody))

    expect(res.status).toBe(200)
    expect(res.body.booked).toBe(true)

    // Wallet was credited the top-up amount, then debited the fare —
    // net balance is what it was before, plus nothing (fully spent).
    expect(await walletBalance()).toBe(0)

    const fundTxn = await prisma.walletTransaction.findFirst({ where: { userId, type: 'fund' } })
    expect(fundTxn).not.toBeNull()
    expect(Number(fundTxn!.amount)).toBe(3_000)

    const intent = await prisma.paymentIntent.findUnique({ where: { providerReference: reference } })
    expect(intent!.status).toBe('succeeded')
    expect(intent!.bookingId).not.toBeNull()

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: intent!.bookingId! } })
    expect(booking.status).toBe('booked')
    expect(booking.seatId).toBe(seatIds[0])
    expect(Number(booking.amount)).toBe(5_000)

    const hold = await prisma.seatHold.findUnique({ where: { id: holdId } })
    expect(hold).toBeNull() // consumed
  })

  it('rejects a webhook call with an invalid signature and changes nothing', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(2_000)
    const holdId = await placeHold(tripId, seatIds[0])

    const topUp = await request(app)
      .post('/bookings/top-up-and-pay')
      .set('Authorization', authHeader)
      .send({ holdId, provider: 'paystack' })
    const { reference } = topUp.body

    const rawBody = paystackSuccessPayload(reference)
    const res = await postWebhook(rawBody, 'not-a-real-signature'.padEnd(128, '0'))

    expect(res.status).toBe(401)
    expect(await walletBalance()).toBe(2_000) // unchanged — the top-up was never confirmed

    const intent = await prisma.paymentIntent.findUnique({ where: { providerReference: reference } })
    expect(intent!.status).toBe('pending') // untouched
  })

  it('is idempotent against a duplicate webhook delivery for the same reference', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(2_000)
    const holdId = await placeHold(tripId, seatIds[0])

    const topUp = await request(app)
      .post('/bookings/top-up-and-pay')
      .set('Authorization', authHeader)
      .send({ holdId, provider: 'paystack' })
    const { reference } = topUp.body

    const rawBody = paystackSuccessPayload(reference)
    const signature = signPaystackBody(rawBody)

    const first = await postWebhook(rawBody, signature)
    expect(first.status).toBe(200)
    expect(first.body.booked).toBe(true)
    expect(await walletBalance()).toBe(0)

    // Gateway retries the exact same event (common for webhooks).
    const second = await postWebhook(rawBody, signature)
    expect(second.status).toBe(200)
    expect(second.body.booked).toBe(false) // "already-processed", not booked again

    // No second wallet credit, no second booking.
    expect(await walletBalance()).toBe(0)
    const fundTxns = await prisma.walletTransaction.findMany({ where: { userId, type: 'fund' } })
    expect(fundTxns).toHaveLength(1)
    const bookings = await prisma.booking.findMany({ where: { tripId } })
    expect(bookings).toHaveLength(1)
  })

  it('still credits the wallet and completes the booking if the original hold expired before the webhook arrived', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(2_000)
    const holdId = await placeHold(tripId, seatIds[0])

    const topUp = await request(app)
      .post('/bookings/top-up-and-pay')
      .set('Authorization', authHeader)
      .send({ holdId, provider: 'paystack' })
    const { reference } = topUp.body

    // Simulate the rider taking a long time on the gateway's checkout
    // page — long enough for the 10-minute hold to lapse before they
    // finish paying and the webhook fires.
    await prisma.seatHold.update({ where: { id: holdId }, data: { expiresAt: new Date(Date.now() - 1000) } })

    const rawBody = paystackSuccessPayload(reference)
    const res = await postWebhook(rawBody, signPaystackBody(rawBody))

    expect(res.status).toBe(200)
    expect(res.body.booked).toBe(true) // money was never lost, and the seat was still free

    expect(await walletBalance()).toBe(0)
    const intent = await prisma.paymentIntent.findUnique({ where: { providerReference: reference } })
    expect(intent!.status).toBe('succeeded')
    expect(intent!.bookingId).not.toBeNull()

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: intent!.bookingId! } })
    expect(booking.status).toBe('booked')
    expect(booking.seatId).toBe(seatIds[0])
  })

  it('credits the wallet but leaves the booking unmade if the segment was taken by someone else in the meantime', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(2_000)
    const holdId = await placeHold(tripId, seatIds[0])

    const topUp = await request(app)
      .post('/bookings/top-up-and-pay')
      .set('Authorization', authHeader)
      .send({ holdId, provider: 'paystack' })
    const { reference } = topUp.body

    // While this rider was on the gateway's page, someone else booked
    // the exact same seat/segment directly (e.g. paid with an
    // already-sufficient wallet balance).
    await prisma.booking.create({
      data: {
        userId: otherUserId,
        tripId,
        seatId: seatIds[0],
        boardStopId: stopA.id,
        alightStopId: stopC.id,
        class: 'standard',
        paymentMethod: 'wallet',
        amount: 5000,
        status: 'booked',
      },
    })

    const rawBody = paystackSuccessPayload(reference)
    const res = await postWebhook(rawBody, signPaystackBody(rawBody))

    expect(res.status).toBe(200)
    expect(res.body.booked).toBe(false) // "wallet-credited-only"

    // The rider's money is never lost even though the seat was gone —
    // wallet still gets the full top-up (2,000 funded + 3,000 credited).
    expect(await walletBalance()).toBe(5_000)

    const intent = await prisma.paymentIntent.findUnique({ where: { providerReference: reference } })
    expect(intent!.status).toBe('succeeded')
    expect(intent!.bookingId).toBeNull()

    // Only the other rider's booking exists for this seat.
    const bookings = await prisma.booking.findMany({ where: { tripId, seatId: seatIds[0] } })
    expect(bookings).toHaveLength(1)
    expect(bookings[0].userId).toBe(otherUserId)
  })

  it('acknowledges an unrecognized reference without touching any wallet', async () => {
    const rawBody = paystackSuccessPayload('paystack_does-not-exist')
    const res = await postWebhook(rawBody, signPaystackBody(rawBody))

    expect(res.status).toBe(200)
    expect(res.body.booked).toBe(false)
    expect(await walletBalance()).toBe(0)
  })

  it('ignores a non-success event (e.g. a failed charge) without crediting anything', async () => {
    const { tripId, seatIds } = await makeTrip(48)
    await fundWallet(2_000)
    const holdId = await placeHold(tripId, seatIds[0])

    const topUp = await request(app)
      .post('/bookings/top-up-and-pay')
      .set('Authorization', authHeader)
      .send({ holdId, provider: 'paystack' })
    const { reference } = topUp.body

    const rawBody = JSON.stringify({ event: 'charge.failed', data: { reference, status: 'failed' } })
    const res = await postWebhook(rawBody, signPaystackBody(rawBody))

    // Not a success event — acknowledged and ignored, no `booked` key
    // at all (that field only exists on the confirmed-payment path).
    expect(res.status).toBe(200)
    expect(res.body.booked).toBeUndefined()
    expect(res.body.message).toMatch(/ignored/i)
    expect(await walletBalance()).toBe(2_000) // unchanged from the initial fund

    const intent = await prisma.paymentIntent.findUnique({ where: { providerReference: reference } })
    expect(intent!.status).toBe('pending') // untouched — never confirmed
  })
})

import 'dotenv/config'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { holdSeat, SeatConflictError } from '../src/lib/holdSeat'

/**
 * Integration tests against a real Postgres database (whatever
 * DATABASE_URL in .env points at — same DB used for local dev; see
 * README "Trip generation" section for how that's provisioned). These
 * exercise the actual `SELECT ... FOR UPDATE` transaction in
 * holdSeat.ts, not a mock, since the whole point is to prove the
 * locking genuinely prevents the race under concurrent requests.
 *
 * Fixture: a 3-stop route A -> B -> C (all boarding-enabled) with a
 * single-seat bus, so every test below contends on exactly one seat.
 * A fresh trip + seat is created per test so tests can run
 * concurrently against the *same* seat within a test without earlier
 * tests' holds leaking in and causing false conflicts.
 */

let parkA: { id: string }
let parkB: { id: string }
let parkC: { id: string }
let routeId: string
let stopA: { id: string; stopOrder: number }
let stopB: { id: string; stopOrder: number }
let stopC: { id: string; stopOrder: number }
let busId: string
let userId: string

let tripId: string
let seatId: string
let tripCounter = 0

beforeAll(async () => {
  parkA = await prisma.park.create({ data: { name: 'Test Park A', city: 'Lagos', state: 'Lagos' } })
  parkB = await prisma.park.create({ data: { name: 'Test Park B', city: 'Ibadan', state: 'Oyo' } })
  parkC = await prisma.park.create({ data: { name: 'Test Park C', city: 'Benin', state: 'Edo' } })

  const route = await prisma.route.create({
    data: { originParkId: parkA.id, destParkId: parkC.id, durationMins: 300 },
  })
  routeId = route.id

  stopA = await prisma.routeStop.create({
    data: { routeId, parkId: parkA.id, stopOrder: 1, isBoardingPoint: true },
  })
  stopB = await prisma.routeStop.create({
    data: { routeId, parkId: parkB.id, stopOrder: 2, isBoardingPoint: true },
  })
  stopC = await prisma.routeStop.create({
    data: { routeId, parkId: parkC.id, stopOrder: 3, isBoardingPoint: true },
  })

  const bus = await prisma.bus.create({ data: { plate: `TEST-HOLD-${Date.now()}`, capacity: 1, class: 'standard' } })
  busId = bus.id

  const user = await prisma.user.create({ data: { phone: `+1555${Date.now()}`.slice(0, 15), role: 'rider' } })
  userId = user.id
})

afterAll(async () => {
  // Defensive: if a test failed before its afterEach ran, this keeps
  // afterAll from failing on a dangling FK too.
  await prisma.trip.deleteMany({ where: { routeId } })
  await prisma.bus.delete({ where: { id: busId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.route.delete({ where: { id: routeId } }) // cascades route_stops
  await prisma.park.deleteMany({ where: { id: { in: [parkA.id, parkB.id, parkC.id] } } })
  await prisma.$disconnect()
})

beforeEach(async () => {
  tripCounter += 1
  const trip = await prisma.trip.create({
    data: {
      routeId,
      busId,
      status: 'scheduled',
      // Unique per test so the (routeId, departureTime) constraint
      // never collides between tests.
      departureTime: new Date(Date.UTC(2030, 0, 1, 0, tripCounter)),
    },
  })
  tripId = trip.id

  const seat = await prisma.tripSeat.create({ data: { tripId, seatNumber: '01', class: 'standard' } })
  seatId = seat.id
})

afterEach(async () => {
  await prisma.booking.deleteMany({ where: { tripId } })
  await prisma.seatHold.deleteMany({ where: { tripId } })
  await prisma.tripSeat.deleteMany({ where: { tripId } })
  await prisma.trip.delete({ where: { id: tripId } })
})

describe('holdSeat concurrency', () => {
  it('places a hold and returns an id with a ~10 minute expiry', async () => {
    const before = Date.now()
    const result = await holdSeat({
      tripId,
      seatId,
      userId,
      boardStopId: stopA.id,
      alightStopId: stopC.id,
    })

    expect(result.id).toBeTruthy()
    const minutesUntilExpiry = (result.expiresAt.getTime() - before) / 60_000
    expect(minutesUntilExpiry).toBeGreaterThan(9)
    expect(minutesUntilExpiry).toBeLessThanOrEqual(10.5)
  })

  it('two concurrent requests for OVERLAPPING segments of the same seat: exactly one succeeds', async () => {
    // A->B and A->C overlap (both start at stop A).
    const requestA = holdSeat({ tripId, seatId, userId, boardStopId: stopA.id, alightStopId: stopB.id })
    const requestB = holdSeat({ tripId, seatId, userId, boardStopId: stopA.id, alightStopId: stopC.id })

    const results = await Promise.allSettled([requestA, requestB])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SeatConflictError)

    // And the DB agrees: only one hold row actually exists for this seat.
    const holds = await prisma.seatHold.findMany({ where: { tripId, seatId } })
    expect(holds).toHaveLength(1)
  })

  it('two concurrent requests for NON-overlapping segments of the same seat: both succeed', async () => {
    // A->B and B->C are adjacent, not overlapping (share only the
    // boundary stop B, which the overlap test correctly excludes).
    const requestA = holdSeat({ tripId, seatId, userId, boardStopId: stopA.id, alightStopId: stopB.id })
    const requestB = holdSeat({ tripId, seatId, userId, boardStopId: stopB.id, alightStopId: stopC.id })

    const results = await Promise.allSettled([requestA, requestB])

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)

    const holds = await prisma.seatHold.findMany({ where: { tripId, seatId } })
    expect(holds).toHaveLength(2)
  })

  it('rejects a hold for a segment that overlaps an existing BOOKING (not just another hold)', async () => {
    // Simulate an already-booked seat for A->C directly (bypassing
    // holdSeat, since this test is about bookings, not holds).
    await prisma.booking.create({
      data: {
        userId,
        tripId,
        seatId,
        boardStopId: stopA.id,
        alightStopId: stopC.id,
        class: 'standard',
        paymentMethod: 'wallet',
        amount: 5000,
        status: 'booked',
      },
    })

    await expect(
      holdSeat({ tripId, seatId, userId, boardStopId: stopB.id, alightStopId: stopC.id }),
    ).rejects.toBeInstanceOf(SeatConflictError)
    // (booking cleanup handled by afterEach)
  })
})

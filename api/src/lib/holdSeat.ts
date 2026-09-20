import { prisma } from './prisma'
import { resolveSegment, NotFoundError, SegmentValidationError } from './segments'

export class SeatConflictError extends Error {}

const HOLD_DURATION_MINUTES = 10

export interface HoldSeatParams {
  tripId: string
  seatId: string
  userId: string
  boardStopId: string
  alightStopId: string
}

export interface HoldResult {
  id: string
  expiresAt: Date
}

/**
 * Places a segment-aware hold on a seat, or rejects if the requested
 * [boardStopOrder, alightStopOrder) range overlaps an existing booking
 * or active hold on that same seat.
 *
 * Race-safety walkthrough (why this is airtight against two concurrent
 * requests for overlapping segments of the same seat):
 *
 * 1. `SELECT ... FOR UPDATE` on the trip_seats row is the first thing
 *    the transaction does. Postgres row locks are held until COMMIT or
 *    ROLLBACK, so a second transaction requesting the SAME seat blocks
 *    on this exact statement until the first transaction finishes —
 *    the two transactions cannot both be "inside" the critical section
 *    (lock acquired) at the same time for the same seat.
 * 2. Because the second transaction's `FOR UPDATE` only returns once
 *    the first has committed or rolled back, its subsequent overlap
 *    check (still plain READ COMMITTED — no need for SERIALIZABLE) is
 *    guaranteed to see the first transaction's insert if it committed.
 *    So the two transactions are effectively serialized *per seat*:
 *    whichever acquires the lock first fully completes (check + maybe
 *    insert) before the second's check ever runs.
 * 3. Only one seat is ever locked per call, and never more than one at
 *    a time, so there's no lock-ordering deadlock risk.
 * 4. Locking is per-seat, not per-segment — coarser than strictly
 *    necessary (two requests for genuinely non-overlapping segments of
 *    the same seat still serialize instead of running in parallel),
 *    but correct is more important than maximally concurrent here, and
 *    a hold-check is a few milliseconds so the added wait is trivial.
 *    Different seats never contend with each other at all.
 */
export async function holdSeat(params: HoldSeatParams): Promise<HoldResult> {
  const { tripId, seatId, userId, boardStopId, alightStopId } = params

  const trip = await prisma.trip.findUnique({ where: { id: tripId } })
  if (!trip) throw new NotFoundError('Trip not found')
  if (trip.status !== 'scheduled') {
    throw new SegmentValidationError('Trip is not open for booking')
  }

  const segment = await resolveSegment(tripId, boardStopId, alightStopId)

  return prisma.$transaction(
    async (tx) => {
      const lockedSeat = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM trip_seats WHERE id = ${seatId}::uuid AND trip_id = ${tripId}::uuid FOR UPDATE
      `
      if (lockedSeat.length === 0) throw new NotFoundError('Seat not found on this trip')

      // Re-check trip status now that we're committed to this
      // transaction, in case it was cancelled between the pre-check
      // above and acquiring the seat lock.
      const currentTrip = await tx.trip.findUniqueOrThrow({ where: { id: tripId } })
      if (currentTrip.status !== 'scheduled') {
        throw new SegmentValidationError('Trip is not open for booking')
      }

      const conflictRows = await tx.$queryRaw<{ conflict: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM bookings b
          JOIN route_stops bs ON bs.id = b.board_stop_id
          JOIN route_stops as_ ON as_.id = b.alight_stop_id
          WHERE b.trip_id = ${tripId}::uuid
            AND b.seat_id = ${seatId}::uuid
            AND b.status IN ('booked', 'reserved_unpaid')
            AND bs.stop_order < ${segment.alightStopOrder}
            AND as_.stop_order > ${segment.boardStopOrder}
          UNION ALL
          SELECT 1 FROM seat_holds sh
          JOIN route_stops hbs ON hbs.id = sh.board_stop_id
          JOIN route_stops has_ ON has_.id = sh.alight_stop_id
          WHERE sh.trip_id = ${tripId}::uuid
            AND sh.seat_id = ${seatId}::uuid
            AND sh.expires_at > now()
            AND hbs.stop_order < ${segment.alightStopOrder}
            AND has_.stop_order > ${segment.boardStopOrder}
        ) AS conflict
      `

      if (conflictRows[0]?.conflict) {
        throw new SeatConflictError('Seat is already held or booked for an overlapping segment')
      }

      const expiresAt = new Date(Date.now() + HOLD_DURATION_MINUTES * 60 * 1000)
      const hold = await tx.seatHold.create({
        data: { tripId, seatId, userId, boardStopId, alightStopId, expiresAt },
      })

      return { id: hold.id, expiresAt: hold.expiresAt }
    },
    {
      maxWait: 10_000, // time allowed to even acquire a connection/start the tx
      timeout: 10_000, // time allowed for the tx to run once started (includes lock wait)
    },
  )
}

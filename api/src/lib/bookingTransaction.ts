import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'
import { resolveSegment, NotFoundError, SegmentValidationError, type ResolvedSegment } from './segments'
import { resolveFare } from './fare'
import { SeatConflictError } from './holdSeat'

export class HoldExpiredError extends Error {}
export class InsufficientBalanceError extends Error {}

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const PAY_AT_PARK_CUTOFF_HOURS = 2

interface ReserveParams {
  tripId: string
  seatId: string
  userId: string
  segment: ResolvedSegment
  holdId?: string
  requireValidHold: boolean
}

/**
 * Shared first half of every booking-creation path (wallet, pay-at-park,
 * webhook-confirmed top-up). Must run inside a `prisma.$transaction`
 * callback — takes that transaction's client as `tx`.
 *
 * Reuses the exact same `SELECT ... FOR UPDATE` + overlap-check pattern
 * as holdSeat.ts, for the same reason: the seat row is the actually
 * contended resource, and locking it here is what makes "verify the
 * hold, check for conflicts, then insert the booking" race-free against
 * a second concurrent booking/hold attempt on an overlapping segment.
 *
 * Takes an already-resolved `segment` rather than calling
 * resolveSegment() itself — that function reads through the plain
 * (non-transactional) `prisma` client, and issuing a query on a
 * separate connection while `tx` is mid-transaction holding the seat
 * lock stalls badly against the local dev Postgres (PGlite), which
 * doesn't handle cross-connection concurrency the way real Postgres
 * does. Resolve everything through plain `prisma` *before* opening the
 * transaction (see bookWithWallet/bookPayAtPark below) — good practice
 * regardless of the dev-DB quirk, since it also keeps the transaction
 * itself shorter.
 *
 * `requireValidHold` distinguishes two call sites:
 * - true (pay-with-wallet, pay-at-park): the synchronous checkout
 *   paths, where the user is expected to still hold a live seat_holds
 *   row. Missing/expired -> reject outright with HoldExpiredError.
 * - false (webhook-confirmed top-up-and-pay): the async gateway path.
 *   The original hold may have legitimately expired during the time
 *   the user was on the payment page — that's fine, we just re-run the
 *   overlap check fresh against current bookings/holds. If a *different*
 *   hold or booking has since claimed an overlapping segment, this
 *   still correctly rejects (SeatConflictError) rather than double-
 *   booking the seat.
 */
async function reserveSeatWithinTx(tx: Tx, params: ReserveParams) {
  const { tripId, seatId, userId, segment, holdId, requireValidHold } = params

  const lockedSeat = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM trip_seats WHERE id = ${seatId}::uuid AND trip_id = ${tripId}::uuid FOR UPDATE
  `
  if (lockedSeat.length === 0) throw new NotFoundError('Seat not found on this trip')

  let hold = holdId ? await tx.seatHold.findUnique({ where: { id: holdId } }) : null
  if (hold && (hold.userId !== userId || hold.tripId !== tripId || hold.seatId !== seatId)) {
    // Someone passed a holdId that isn't theirs / doesn't match this
    // booking request — treat it as absent rather than trusting it.
    hold = null
  }

  if (requireValidHold) {
    if (!hold || hold.expiresAt <= new Date()) {
      throw new HoldExpiredError('Your seat hold has expired — please select your seat again')
    }
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
        AND sh.id != ${hold?.id ?? NIL_UUID}::uuid
        AND hbs.stop_order < ${segment.alightStopOrder}
        AND has_.stop_order > ${segment.boardStopOrder}
    ) AS conflict
  `
  if (conflictRows[0]?.conflict) {
    throw new SeatConflictError('Seat is no longer available for this segment')
  }

  if (hold) await tx.seatHold.delete({ where: { id: hold.id } })
}

export interface BookWithWalletParams {
  userId: string
  tripId: string
  seatId: string
  boardStopId: string
  alightStopId: string
  holdId?: string
  requireValidHold: boolean
}

export async function bookWithWallet(params: BookWithWalletParams) {
  const { userId, tripId, seatId, boardStopId, alightStopId, holdId, requireValidHold } = params

  const segment = await resolveSegment(tripId, boardStopId, alightStopId)
  const { amount, seatClass } = await resolveFare(tripId, boardStopId, alightStopId)

  return prisma.$transaction(
    async (tx) => {
      await reserveSeatWithinTx(tx, { tripId, seatId, userId, segment, holdId, requireValidHold })

      // Ensures a wallet row exists without a race on first-ever use —
      // ON CONFLICT DO NOTHING is atomic at the DB level even if two
      // concurrent transactions both try to create the same user's
      // first wallet row simultaneously.
      await tx.$executeRaw`
        INSERT INTO wallets (user_id, balance) VALUES (${userId}::uuid, 0)
        ON CONFLICT (user_id) DO NOTHING
      `
      const walletRows = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>`
        SELECT balance FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE
      `
      const balance = walletRows[0].balance
      if (Number(balance) < Number(amount)) {
        throw new InsufficientBalanceError('Insufficient wallet balance')
      }

      const booking = await tx.booking.create({
        data: {
          userId,
          tripId,
          seatId,
          boardStopId,
          alightStopId,
          class: seatClass,
          paymentMethod: 'wallet',
          amount,
          status: 'booked',
        },
      })

      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: amount }, updatedAt: new Date() },
      })

      await tx.walletTransaction.create({
        data: { userId, type: 'debit', amount, bookingId: booking.id },
      })

      return booking
    },
    { maxWait: 10_000, timeout: 10_000 },
  )
}

export interface BookManualParams {
  userId: string
  performedBy: string
  tripId: string
  seatId: string
  boardStopId: string
  alightStopId: string
  paymentMethod: 'pay_at_park' | 'wallet'
}

/**
 * Counter/manual booking by park staff on a passenger's behalf (walk-in
 * or phone booking). Reuses the exact same seat-locking + overlap-check
 * logic as the rider flows (reserveSeatWithinTx) — the only differences
 * are that there's no seat_holds row to consume (staff go straight from
 * seat-map to booking for counter speed, so requireValidHold is always
 * false here) and `performedBy` records which staff member created it.
 */
export async function bookManual(params: BookManualParams) {
  const { userId, performedBy, tripId, seatId, boardStopId, alightStopId, paymentMethod } = params

  const segment = await resolveSegment(tripId, boardStopId, alightStopId)
  const { amount, seatClass } = await resolveFare(tripId, boardStopId, alightStopId)

  if (paymentMethod === 'pay_at_park') {
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })
    const cutoff = new Date(trip.departureTime.getTime() - PAY_AT_PARK_CUTOFF_HOURS * 60 * 60 * 1000)
    if (cutoff <= new Date()) {
      throw new SegmentValidationError(
        `Pay-at-park closes ${PAY_AT_PARK_CUTOFF_HOURS}h before departure — collect payment now instead`,
      )
    }

    return prisma.$transaction(
      async (tx) => {
        await reserveSeatWithinTx(tx, { tripId, seatId, userId, segment, requireValidHold: false })

        return tx.booking.create({
          data: {
            userId,
            tripId,
            seatId,
            boardStopId,
            alightStopId,
            class: seatClass,
            paymentMethod: 'pay_at_park',
            amount,
            status: 'reserved_unpaid',
            payAtParkCutoff: cutoff,
            performedBy,
          },
        })
      },
      { maxWait: 10_000, timeout: 10_000 },
    )
  }

  return prisma.$transaction(
    async (tx) => {
      await reserveSeatWithinTx(tx, { tripId, seatId, userId, segment, requireValidHold: false })

      await tx.$executeRaw`
        INSERT INTO wallets (user_id, balance) VALUES (${userId}::uuid, 0)
        ON CONFLICT (user_id) DO NOTHING
      `
      const walletRows = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>`
        SELECT balance FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE
      `
      if (Number(walletRows[0].balance) < Number(amount)) {
        throw new InsufficientBalanceError("Passenger's wallet balance is insufficient")
      }

      const booking = await tx.booking.create({
        data: {
          userId,
          tripId,
          seatId,
          boardStopId,
          alightStopId,
          class: seatClass,
          paymentMethod: 'wallet',
          amount,
          status: 'booked',
          performedBy,
        },
      })

      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: amount }, updatedAt: new Date() },
      })

      await tx.walletTransaction.create({
        data: { userId, type: 'debit', amount, bookingId: booking.id },
      })

      return booking
    },
    { maxWait: 10_000, timeout: 10_000 },
  )
}

export interface BookPayAtParkParams {
  userId: string
  tripId: string
  seatId: string
  boardStopId: string
  alightStopId: string
  holdId?: string
}

export async function bookPayAtPark(params: BookPayAtParkParams) {
  const { userId, tripId, seatId, boardStopId, alightStopId, holdId } = params

  const segment = await resolveSegment(tripId, boardStopId, alightStopId)
  const { amount, seatClass } = await resolveFare(tripId, boardStopId, alightStopId)
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })
  const cutoff = new Date(trip.departureTime.getTime() - PAY_AT_PARK_CUTOFF_HOURS * 60 * 60 * 1000)
  if (cutoff <= new Date()) {
    throw new SegmentValidationError(
      `Pay-at-park closes ${PAY_AT_PARK_CUTOFF_HOURS}h before departure — pay now instead`,
    )
  }

  return prisma.$transaction(
    async (tx) => {
      await reserveSeatWithinTx(tx, { tripId, seatId, userId, segment, holdId, requireValidHold: true })

      return tx.booking.create({
        data: {
          userId,
          tripId,
          seatId,
          boardStopId,
          alightStopId,
          class: seatClass,
          paymentMethod: 'pay_at_park',
          amount,
          status: 'reserved_unpaid',
          payAtParkCutoff: cutoff,
        },
      })
    },
    { maxWait: 10_000, timeout: 10_000 },
  )
}

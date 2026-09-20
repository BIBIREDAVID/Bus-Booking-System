import { prisma } from './prisma'
import { resolveSegment } from './segments'

export interface SeatAvailability {
  id: string
  seatNumber: string
  class: string
  available: boolean
}

/**
 * Segment-aware seat availability for a trip. Mirrors the example
 * query at the bottom of schema.sql: a seat is unavailable for the
 * requested [boardStopOrder, alightStopOrder) range if any existing
 * booking or active hold on that seat has an overlapping range —
 * overlap test: existing.board < requested.alight AND existing.alight
 * > requested.board.
 */
export async function getSeatMap(tripId: string, boardStopId: string, alightStopId: string): Promise<SeatAvailability[]> {
  const segment = await resolveSegment(tripId, boardStopId, alightStopId)

  const rows = await prisma.$queryRaw<SeatAvailability[]>`
    SELECT
      ts.id,
      ts.seat_number AS "seatNumber",
      ts.class,
      NOT (
        EXISTS (
          SELECT 1 FROM bookings b
          JOIN route_stops bs ON bs.id = b.board_stop_id
          JOIN route_stops as_ ON as_.id = b.alight_stop_id
          WHERE b.trip_id = ts.trip_id
            AND b.seat_id = ts.id
            AND b.status IN ('booked', 'reserved_unpaid')
            AND bs.stop_order < ${segment.alightStopOrder}
            AND as_.stop_order > ${segment.boardStopOrder}
        )
        OR EXISTS (
          SELECT 1 FROM seat_holds sh
          JOIN route_stops hbs ON hbs.id = sh.board_stop_id
          JOIN route_stops has_ ON has_.id = sh.alight_stop_id
          WHERE sh.trip_id = ts.trip_id
            AND sh.seat_id = ts.id
            AND sh.expires_at > now()
            AND hbs.stop_order < ${segment.alightStopOrder}
            AND has_.stop_order > ${segment.boardStopOrder}
        )
      ) AS available
    FROM trip_seats ts
    WHERE ts.trip_id = ${tripId}::uuid
    ORDER BY ts.seat_number
  `

  return rows
}

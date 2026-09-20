import { Router } from 'express'
import { z } from 'zod'
import type { BookingStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'

export const adminReportsRouter = Router()

adminReportsRouter.use(requireAuth, requireRole('admin'))

const REVENUE_STATUSES: BookingStatus[] = ['booked', 'completed']

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

function parseDateRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {}
  if (from) {
    const [y, m, d] = from.split('-').map(Number)
    range.gte = new Date(Date.UTC(y, m - 1, d))
  }
  if (to) {
    const [y, m, d] = to.split('-').map(Number)
    range.lt = new Date(Date.UTC(y, m - 1, d + 1)) // inclusive of the "to" day
  }
  return range
}

adminReportsRouter.get('/reports/revenue', async (req, res) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Invalid query' })

  // Reported by when the booking was made (createdAt), not the trip's
  // departure date — that's when the money actually moved.
  const range = parseDateRange(parsed.data.from, parsed.data.to)
  const dateFilter = Object.keys(range).length > 0 ? { createdAt: range } : {}

  const [paidBookings, pendingAgg, cancelledCount] = await Promise.all([
    prisma.booking.findMany({
      where: { status: { in: REVENUE_STATUSES }, ...dateFilter },
      select: {
        amount: true,
        paymentMethod: true,
        trip: { select: { route: { select: { originPark: true, destPark: true } } } },
      },
    }),
    prisma.booking.aggregate({
      where: { status: 'reserved_unpaid', ...dateFilter },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.booking.count({ where: { status: 'cancelled', ...dateFilter } }),
  ])

  const totalRevenue = paidBookings.reduce((sum, b) => sum + Number(b.amount), 0)

  const byPaymentMethodMap = new Map<string, { amount: number; count: number }>()
  const byRouteMap = new Map<string, { amount: number; count: number }>()

  for (const b of paidBookings) {
    const pm = byPaymentMethodMap.get(b.paymentMethod) ?? { amount: 0, count: 0 }
    pm.amount += Number(b.amount)
    pm.count += 1
    byPaymentMethodMap.set(b.paymentMethod, pm)

    const routeLabel = `${b.trip.route.originPark.name} → ${b.trip.route.destPark.name}`
    const r = byRouteMap.get(routeLabel) ?? { amount: 0, count: 0 }
    r.amount += Number(b.amount)
    r.count += 1
    byRouteMap.set(routeLabel, r)
  }

  const byPaymentMethod = Array.from(byPaymentMethodMap.entries())
    .map(([paymentMethod, v]) => ({ paymentMethod, ...v }))
    .sort((a, b) => b.amount - a.amount)

  const byRoute = Array.from(byRouteMap.entries())
    .map(([routeLabel, v]) => ({ routeLabel, ...v }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)

  return res.status(200).json({
    totalRevenue,
    bookingCount: paidBookings.length,
    averageFare: paidBookings.length > 0 ? totalRevenue / paidBookings.length : 0,
    pendingAmount: Number(pendingAgg._sum.amount ?? 0),
    pendingCount: pendingAgg._count,
    cancelledCount,
    byPaymentMethod,
    byRoute,
  })
})

// ------------------------------------------------------------
// GET /admin/reports/occupancy — trip-level occupancy (booked seats vs
// capacity) computed as a single aggregate query, not a loop over
// trips in application code. A seat sold across multiple
// non-overlapping segments (see schema.sql's segment-aware booking
// model) still only counts once per trip — COUNT(DISTINCT seat)
// against a pre-filtered booking join, not a raw booking count, is
// what keeps occupancy from ever reporting over 100%.
// ------------------------------------------------------------

interface TripOccupancyRow {
  tripId: string
  routeId: string
  routeLabel: string
  departureTime: Date
  status: string
  totalSeats: number
  bookedSeats: number
}

adminReportsRouter.get('/reports/occupancy', async (req, res) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Invalid query' })

  // Occupancy is about how full a trip's bus was — filtered by
  // departure date, unlike revenue (which is filtered by when the
  // booking/payment happened).
  const range = parseDateRange(parsed.data.from, parsed.data.to)

  const tripRows = await prisma.$queryRaw<TripOccupancyRow[]>`
    SELECT
      t.id AS "tripId",
      r.id AS "routeId",
      op.name || ' → ' || dp.name AS "routeLabel",
      t.departure_time AS "departureTime",
      t.status,
      COUNT(DISTINCT ts.id)::int AS "totalSeats",
      COUNT(DISTINCT b.seat_id)::int AS "bookedSeats"
    FROM trips t
    JOIN routes r ON r.id = t.route_id
    JOIN parks op ON op.id = r.origin_park_id
    JOIN parks dp ON dp.id = r.dest_park_id
    JOIN trip_seats ts ON ts.trip_id = t.id
    LEFT JOIN bookings b
      ON b.trip_id = t.id
      AND b.seat_id = ts.id
      AND b.status IN ('booked', 'reserved_unpaid', 'completed')
    WHERE t.bus_id IS NOT NULL
      AND (${range.gte ?? null}::timestamptz IS NULL OR t.departure_time >= ${range.gte ?? null})
      AND (${range.lt ?? null}::timestamptz IS NULL OR t.departure_time < ${range.lt ?? null})
    GROUP BY t.id, r.id, op.name, dp.name, t.departure_time, t.status
    ORDER BY t.departure_time ASC
    LIMIT 200
  `

  const trips = tripRows.map((t) => ({
    tripId: t.tripId,
    routeLabel: t.routeLabel,
    departureTime: t.departureTime,
    status: t.status,
    totalSeats: t.totalSeats,
    bookedSeats: t.bookedSeats,
    occupancyRate: t.totalSeats > 0 ? t.bookedSeats / t.totalSeats : 0,
  }))

  const totalSeats = trips.reduce((sum, t) => sum + t.totalSeats, 0)
  const totalBookedSeats = trips.reduce((sum, t) => sum + t.bookedSeats, 0)

  // Rolled up from the already-aggregated per-trip rows above — this
  // is a plain in-memory reduce over <=200 rows, not another query per
  // route, so it stays a single round trip to the database overall.
  const byRouteMap = new Map<string, { totalSeats: number; bookedSeats: number; tripCount: number }>()
  for (const t of trips) {
    const r = byRouteMap.get(t.routeLabel) ?? { totalSeats: 0, bookedSeats: 0, tripCount: 0 }
    r.totalSeats += t.totalSeats
    r.bookedSeats += t.bookedSeats
    r.tripCount += 1
    byRouteMap.set(t.routeLabel, r)
  }
  const byRoute = Array.from(byRouteMap.entries())
    .map(([routeLabel, v]) => ({
      routeLabel,
      ...v,
      occupancyRate: v.totalSeats > 0 ? v.bookedSeats / v.totalSeats : 0,
    }))
    .sort((a, b) => b.occupancyRate - a.occupancyRate)

  return res.status(200).json({
    overallOccupancyRate: totalSeats > 0 ? totalBookedSeats / totalSeats : 0,
    totalSeats,
    totalBookedSeats,
    tripCount: trips.length,
    byRoute,
    trips,
  })
})

// ------------------------------------------------------------
// GET /admin/reports/occupancy/:tripId/segments — per-segment
// occupancy drill-down for one trip, as a single aggregate query.
// For each fare segment on the trip's route, counts distinct seats
// whose booked [board_order, alight_order) range overlaps that
// segment — the same overlap rule used everywhere else in this
// codebase for segment-aware seat availability (see schema.sql's
// example query / lib/seatMap.ts).
// ------------------------------------------------------------

interface SegmentOccupancyRow {
  segmentId: string
  segmentLabel: string
  totalSeats: number
  bookedSeats: number
}

adminReportsRouter.get('/reports/occupancy/:tripId/segments', async (req, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.tripId } })
  if (!trip) return res.status(404).json({ message: 'Trip not found' })

  const rows = await prisma.$queryRaw<SegmentOccupancyRow[]>`
    SELECT
      seg.id AS "segmentId",
      fp.name || ' → ' || tp.name AS "segmentLabel",
      COUNT(DISTINCT ts.id)::int AS "totalSeats",
      COUNT(DISTINCT ob.seat_id)::int AS "bookedSeats"
    FROM route_segments seg
    JOIN route_stops fs ON fs.id = seg.from_stop_id
    JOIN route_stops tos ON tos.id = seg.to_stop_id
    JOIN parks fp ON fp.id = fs.park_id
    JOIN parks tp ON tp.id = tos.park_id
    CROSS JOIN trip_seats ts
    LEFT JOIN bookings ob
      ON ob.trip_id = ts.trip_id
      AND ob.seat_id = ts.id
      AND ob.status IN ('booked', 'reserved_unpaid', 'completed')
      AND EXISTS (
        SELECT 1 FROM route_stops bs, route_stops as_
        WHERE bs.id = ob.board_stop_id AND as_.id = ob.alight_stop_id
          AND bs.stop_order < tos.stop_order AND as_.stop_order > fs.stop_order
      )
    WHERE seg.route_id = ${trip.routeId}::uuid
      AND ts.trip_id = ${trip.id}::uuid
    GROUP BY seg.id, fp.name, tp.name, fs.stop_order
    ORDER BY fs.stop_order ASC
  `

  return res.status(200).json({
    tripId: trip.id,
    segments: rows.map((r) => ({
      segmentId: r.segmentId,
      segmentLabel: r.segmentLabel,
      totalSeats: r.totalSeats,
      bookedSeats: r.bookedSeats,
      occupancyRate: r.totalSeats > 0 ? r.bookedSeats / r.totalSeats : 0,
    })),
  })
})

// ------------------------------------------------------------
// GET /admin/reports/ratings — average booking_ratings.stars per
// driver and per route, each as a single aggregate query (join
// bookings -> trips -> drivers/routes -> booking_ratings, GROUP BY).
// ------------------------------------------------------------

interface DriverRatingRow {
  driverId: string
  driverName: string
  avgRating: number
  ratingCount: number
}

interface RouteRatingRow {
  routeId: string
  routeLabel: string
  avgRating: number
  ratingCount: number
}

adminReportsRouter.get('/reports/ratings', async (_req, res) => {
  const [byDriver, byRoute] = await Promise.all([
    prisma.$queryRaw<DriverRatingRow[]>`
      SELECT
        d.id AS "driverId",
        d.name AS "driverName",
        AVG(br.stars)::float AS "avgRating",
        COUNT(br.booking_id)::int AS "ratingCount"
      FROM booking_ratings br
      JOIN bookings bk ON bk.id = br.booking_id
      JOIN trips t ON t.id = bk.trip_id
      JOIN drivers d ON d.id = t.driver_id
      GROUP BY d.id, d.name
      ORDER BY "avgRating" DESC
    `,
    prisma.$queryRaw<RouteRatingRow[]>`
      SELECT
        r.id AS "routeId",
        op.name || ' → ' || dp.name AS "routeLabel",
        AVG(br.stars)::float AS "avgRating",
        COUNT(br.booking_id)::int AS "ratingCount"
      FROM booking_ratings br
      JOIN bookings bk ON bk.id = br.booking_id
      JOIN trips t ON t.id = bk.trip_id
      JOIN routes r ON r.id = t.route_id
      JOIN parks op ON op.id = r.origin_park_id
      JOIN parks dp ON dp.id = r.dest_park_id
      GROUP BY r.id, op.name, dp.name
      ORDER BY "avgRating" DESC
    `,
  ])

  return res.status(200).json({ byDriver, byRoute })
})

// ------------------------------------------------------------
// GET /admin/reports/open-tickets — open complaints and support
// ticket counts for the dashboard's at-a-glance card.
// ------------------------------------------------------------

adminReportsRouter.get('/reports/open-tickets', async (_req, res) => {
  const [complaintsOpen, complaintsInReview, supportOpen] = await Promise.all([
    prisma.complaint.count({ where: { status: 'open' } }),
    prisma.complaint.count({ where: { status: 'in_review' } }),
    prisma.supportTicket.count({ where: { status: 'open' } }),
  ])

  return res.status(200).json({
    complaints: { open: complaintsOpen, inReview: complaintsInReview },
    supportTickets: { open: supportOpen },
  })
})

import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { generateUpcomingTrips } from '../src/jobs/generateTrips'
import { bookWithWallet, bookManual } from '../src/lib/bookingTransaction'
import { refundBookingToWallet } from '../src/lib/refunds'
import type { Park, Route, Bus, Driver } from '@prisma/client'

/**
 * Seeds everything needed for a full walkthrough demo: reference data
 * (parks/routes/fares/schedules/fleet), an admin + park-staff + three
 * rider accounts, and real bookings in every status so every screen in
 * the app has something to show immediately — no clicking through the
 * UI first to generate data.
 *
 * Reference-data setup (parks, routes, fleet) is idempotent — checked
 * against real data every run, so re-running never duplicates it. The
 * demo-booking section (on the main Lagos→Ibadan→Benin route) is fully
 * REFRESHABLE, not just idempotent: every demo trip is tagged by
 * departing at a time-of-day that doesn't match that route's recurring
 * schedule, so each run deletes any previous demo trips/bookings/etc.
 * and recreates them relative to *now* — otherwise "upcoming" demo
 * bookings would silently turn into past ones a day or two after first
 * seeding, and the whole point of the seed is that it's safe to re-run
 * before a demo to reset everything to a fresh, correctly-timed state.
 *
 * Run with:
 *   cd api
 *   npx prisma db seed
 *
 * (or `npx tsx prisma/seed.ts` directly, same effect)
 */

const ADMIN_PHONE = process.env.SEED_ADMIN_PHONE ?? '+2348000000001'
const ONE_HOUR_MS = 60 * 60 * 1000
const TRIPS_TO_ASSIGN_PER_ROUTE = 4

async function findOrCreatePark(data: { name: string; city: string; state: string }) {
  const existing = await prisma.park.findFirst({ where: { name: data.name } })
  if (existing) return existing
  return prisma.park.create({ data })
}

type SeatFare = { standard: number; luxury: number; vip: number }

/**
 * Creates a route (with every stop, every board/alight fare pair, and a
 * daily schedule) if one doesn't already exist between the given origin
 * and destination parks — idempotent, like the rest of reference data.
 * `legFares` has one entry per adjacent stop pair (length = stops.length - 1);
 * fares for non-adjacent (board, alight) pairs are the sum of the legs
 * between them, same approach the original single-route seed used.
 */
async function ensureRoute(opts: {
  stops: Park[]
  legFares: SeatFare[]
  durationMins: number
  scheduleHourUTC: number
  scheduleMinuteUTC?: number
}): Promise<Route> {
  const { stops, legFares, durationMins, scheduleHourUTC, scheduleMinuteUTC = 0 } = opts
  const origin = stops[0]
  const dest = stops[stops.length - 1]

  let route = await prisma.route.findFirst({ where: { originParkId: origin.id, destParkId: dest.id } })
  const isNew = !route
  if (!route) {
    route = await prisma.route.create({ data: { originParkId: origin.id, destParkId: dest.id, durationMins } })
  }

  if (isNew) {
    const routeStops = []
    for (let i = 0; i < stops.length; i++) {
      const rs = await prisma.routeStop.create({
        data: { routeId: route.id, parkId: stops[i].id, stopOrder: i + 1, isBoardingPoint: true },
      })
      routeStops.push(rs)
    }

    const segmentsData = []
    for (let i = 0; i < routeStops.length; i++) {
      for (let j = i + 1; j < routeStops.length; j++) {
        let standard = 0
        let luxury = 0
        let vip = 0
        for (let k = i; k < j; k++) {
          standard += legFares[k].standard
          luxury += legFares[k].luxury
          vip += legFares[k].vip
        }
        segmentsData.push({
          routeId: route.id,
          fromStopId: routeStops[i].id,
          toStopId: routeStops[j].id,
          fareStandard: standard,
          fareLuxury: luxury,
          fareVip: vip,
        })
      }
    }
    await prisma.routeSegment.createMany({ data: segmentsData })

    await prisma.routeSchedule.create({
      data: {
        routeId: route.id,
        departureTime: new Date(Date.UTC(1970, 0, 1, scheduleHourUTC, scheduleMinuteUTC)),
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        active: true,
      },
    })

    console.log(`Created route ${origin.name} → ${dest.name} (${stops.length} stops) with fares and a daily schedule.`)
  } else {
    console.log(`Route ${origin.name} → ${dest.name} already exists — skipped stops/fares/schedule.`)
  }

  return route
}

/** Assigns a bus/driver (cycling through the given fleet) to the next N unassigned trips on a route — mirrors POST /admin/trips/:id/assign. */
async function assignFleetToRouteTrips(route: Route, fleet: { bus: Bus; driver: Driver }[], count: number) {
  const upcomingTrips = await prisma.trip.findMany({
    where: { routeId: route.id, status: 'scheduled', busId: null },
    orderBy: { departureTime: 'asc' },
    take: count,
  })

  let assigned = 0
  for (const [i, trip] of upcomingTrips.entries()) {
    const { bus, driver } = fleet[i % fleet.length]
    const existingSeats = await prisma.tripSeat.count({ where: { tripId: trip.id } })
    await prisma.$transaction(async (tx) => {
      await tx.trip.update({ where: { id: trip.id }, data: { busId: bus.id, driverId: driver.id } })
      if (existingSeats === 0) {
        const seatNumbers = Array.from({ length: bus.capacity }, (_, i2) => String(i2 + 1).padStart(2, '0'))
        await tx.tripSeat.createMany({
          data: seatNumbers.map((seatNumber) => ({ tripId: trip.id, seatNumber, class: bus.class })),
        })
      }
    })
    assigned++
  }
  return assigned
}

/** Creates a trip on the route with the given bus/driver already assigned and seats generated — mirrors POST /admin/trips/:id/assign. */
async function createAssignedTrip(
  routeId: string,
  busId: string,
  driverId: string,
  hoursFromNow: number,
  capacity: number,
  seatClass: 'standard' | 'luxury' | 'vip',
  status: 'scheduled' | 'completed' = 'scheduled',
) {
  const departureTime = new Date(Date.now() + hoursFromNow * ONE_HOUR_MS)
  const trip = await prisma.trip.create({
    data: { routeId, busId, driverId, departureTime, status },
  })
  const seatNumbers = Array.from({ length: capacity }, (_, i) => String(i + 1).padStart(2, '0'))
  const seats = await Promise.all(
    seatNumbers.map((seatNumber) => prisma.tripSeat.create({ data: { tripId: trip.id, seatNumber, class: seatClass } })),
  )
  return { trip, seats }
}

async function main() {
  console.log('Seeding reference data...')

  // ------------------------------------------------------------
  // Parks — a small national network, not just one city pair.
  // ------------------------------------------------------------
  const lagos = await findOrCreatePark({ name: 'Ojota Park', city: 'Lagos', state: 'Lagos' })
  const ibadan = await findOrCreatePark({ name: 'Challenge Park', city: 'Ibadan', state: 'Oyo' })
  const benin = await findOrCreatePark({ name: 'Benin Park', city: 'Benin City', state: 'Edo' })
  const abuja = await findOrCreatePark({ name: 'Utako Park', city: 'Abuja', state: 'FCT' })
  const portHarcourt = await findOrCreatePark({ name: 'Waterlines Park', city: 'Port Harcourt', state: 'Rivers' })
  const kano = await findOrCreatePark({ name: 'Sabon Gari Park', city: 'Kano', state: 'Kano' })
  const enugu = await findOrCreatePark({ name: 'Holy Ghost Park', city: 'Enugu', state: 'Enugu' })

  // ------------------------------------------------------------
  // Fleet — five buses across all three seat classes, each with its
  // own driver, so different routes show real fare/class variety.
  // ------------------------------------------------------------
  const bus = await prisma.bus.upsert({
    where: { plate: 'ABC-101-XY' },
    update: {},
    create: { plate: 'ABC-101-XY', capacity: 32, class: 'standard', status: 'active' },
  })
  const luxuryBus = await prisma.bus.upsert({
    where: { plate: 'ABC-202-LX' },
    update: {},
    create: { plate: 'ABC-202-LX', capacity: 20, class: 'luxury', status: 'active' },
  })
  const standardBus2 = await prisma.bus.upsert({
    where: { plate: 'DEF-303-ST' },
    update: {},
    create: { plate: 'DEF-303-ST', capacity: 32, class: 'standard', status: 'active' },
  })
  const luxuryBus2 = await prisma.bus.upsert({
    where: { plate: 'DEF-404-LX' },
    update: {},
    create: { plate: 'DEF-404-LX', capacity: 20, class: 'luxury', status: 'active' },
  })
  const vipBus = await prisma.bus.upsert({
    where: { plate: 'GHI-505-VP' },
    update: {},
    create: { plate: 'GHI-505-VP', capacity: 14, class: 'vip', status: 'active' },
  })

  const driver = await prisma.driver.upsert({
    where: { phone: '+2348011111111' },
    update: {},
    create: { name: 'Chinedu Okafor', phone: '+2348011111111', licenseNo: 'LIC-0001', status: 'active' },
  })
  const luxuryDriver = await prisma.driver.upsert({
    where: { phone: '+2348011111112' },
    update: {},
    create: { name: 'Amaka Nwosu', phone: '+2348011111112', licenseNo: 'LIC-0002', status: 'active' },
  })
  const driver2 = await prisma.driver.upsert({
    where: { phone: '+2348011111113' },
    update: {},
    create: { name: 'Bashir Suleiman', phone: '+2348011111113', licenseNo: 'LIC-0003', status: 'active' },
  })
  const luxuryDriver2 = await prisma.driver.upsert({
    where: { phone: '+2348011111114' },
    update: {},
    create: { name: 'Funke Adeyemi', phone: '+2348011111114', licenseNo: 'LIC-0004', status: 'active' },
  })
  const vipDriver = await prisma.driver.upsert({
    where: { phone: '+2348011111115' },
    update: {},
    create: { name: 'Emeka Nnadi', phone: '+2348011111115', licenseNo: 'LIC-0005', status: 'active' },
  })

  // ------------------------------------------------------------
  // Routes — six corridors across the network instead of one.
  // ------------------------------------------------------------
  const mainRoute = await ensureRoute({
    stops: [lagos, ibadan, benin],
    legFares: [
      { standard: 4500, luxury: 6500, vip: 8500 }, // Lagos -> Ibadan
      { standard: 4000, luxury: 6000, vip: 8000 }, // Ibadan -> Benin
    ],
    durationMins: 300,
    scheduleHourUTC: 6,
    scheduleMinuteUTC: 30,
  })

  const lagosAbujaRoute = await ensureRoute({
    stops: [lagos, abuja],
    legFares: [{ standard: 12000, luxury: 16000, vip: 20000 }],
    durationMins: 480,
    scheduleHourUTC: 7,
  })

  const lagosPortHarcourtRoute = await ensureRoute({
    stops: [lagos, benin, portHarcourt],
    legFares: [
      { standard: 8000, luxury: 11000, vip: 14000 }, // Lagos -> Benin
      { standard: 3500, luxury: 5000, vip: 6500 }, // Benin -> Port Harcourt
    ],
    durationMins: 420,
    scheduleHourUTC: 8,
  })

  const ibadanAbujaRoute = await ensureRoute({
    stops: [ibadan, abuja],
    legFares: [{ standard: 9000, luxury: 13000, vip: 16000 }],
    durationMins: 360,
    scheduleHourUTC: 6,
  })

  const lagosKanoRoute = await ensureRoute({
    stops: [lagos, kano],
    legFares: [{ standard: 15000, luxury: 20000, vip: 25000 }],
    durationMins: 600,
    scheduleHourUTC: 20, // overnight departure, common for this distance
  })

  const beninEnuguRoute = await ensureRoute({
    stops: [benin, enugu],
    legFares: [{ standard: 3000, luxury: 4500, vip: 6000 }],
    durationMins: 150,
    scheduleHourUTC: 9,
  })

  // Origin/destination boarding stops on the main route — everything in
  // the demo-booking section below books the full route (origin ->
  // destination), so these two are all that section needs.
  const stopOrigin = await prisma.routeStop.findFirstOrThrow({ where: { routeId: mainRoute.id, parkId: lagos.id } })
  const stopDest = await prisma.routeStop.findFirstOrThrow({ where: { routeId: mainRoute.id, parkId: benin.id } })

  // ------------------------------------------------------------
  // Accounts
  // ------------------------------------------------------------
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    update: { role: 'admin' },
    create: { phone: ADMIN_PHONE, name: 'Admin', role: 'admin' },
  })

  const staff = await prisma.user.upsert({
    where: { phone: '+2348033330001' },
    update: { role: 'park_staff', homeParkId: lagos.id },
    create: { phone: '+2348033330001', name: 'Counter Staff', role: 'park_staff', homeParkId: lagos.id },
  })
  const abujaStaff = await prisma.user.upsert({
    where: { phone: '+2348033330002' },
    update: { role: 'park_staff', homeParkId: abuja.id },
    create: { phone: '+2348033330002', name: 'Abuja Counter Staff', role: 'park_staff', homeParkId: abuja.id },
  })

  async function upsertRider(phone: string, name: string, balance: number) {
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone, name, role: 'rider' },
    })
    await prisma.$executeRaw`INSERT INTO wallets (user_id, balance) VALUES (${user.id}::uuid, 0) ON CONFLICT (user_id) DO NOTHING`
    await prisma.wallet.update({ where: { userId: user.id }, data: { balance } })
    return user
  }

  const rider1 = await upsertRider('+2348022220001', 'Aisha Bello', 50_000)
  const rider2 = await upsertRider('+2348022220002', 'Tunde Alabi', 50_000)
  const rider3 = await upsertRider('+2348022220003', 'Ngozi Eze', 50_000)

  // A couple of saved passengers per rider, for the "book for someone
  // else" flow — otherwise this table stays empty until a rider fills
  // it in by hand.
  async function ensureSavedPassenger(userId: string, name: string, phone: string) {
    const existing = await prisma.savedPassenger.findFirst({ where: { userId, name } })
    if (existing) return existing
    return prisma.savedPassenger.create({ data: { userId, name, phone } })
  }
  await ensureSavedPassenger(rider1.id, 'Zainab Bello', '+2348099990001')
  await ensureSavedPassenger(rider1.id, 'Yusuf Bello', '+2348099990002')
  await ensureSavedPassenger(rider2.id, 'Kemi Alabi', '+2348099990003')

  // ------------------------------------------------------------
  // Generate real trips off every active schedule, then assign fleet
  // to the next few on each route so there's something browsable in
  // Search/Home the moment seeding finishes, beyond the specific demo
  // bookings below (which stay on the main route only).
  // ------------------------------------------------------------
  await generateUpcomingTrips()

  const mainFleet = [
    { bus, driver },
    { bus, driver },
    { bus, driver },
    { bus, driver },
    { bus: luxuryBus, driver: luxuryDriver },
  ]
  const mainAssigned = await assignFleetToRouteTrips(mainRoute, mainFleet, 7) // extra trips on the flagship route

  const abujaFleet = [{ bus: standardBus2, driver: driver2 }, { bus: luxuryBus2, driver: luxuryDriver2 }]
  const lagosAbujaAssigned = await assignFleetToRouteTrips(lagosAbujaRoute, abujaFleet, TRIPS_TO_ASSIGN_PER_ROUTE)

  const phFleet = [{ bus: luxuryBus2, driver: luxuryDriver2 }, { bus: standardBus2, driver: driver2 }]
  const lagosPhAssigned = await assignFleetToRouteTrips(lagosPortHarcourtRoute, phFleet, TRIPS_TO_ASSIGN_PER_ROUTE)

  const ibadanAbujaFleet = [{ bus: standardBus2, driver: driver2 }]
  const ibadanAbujaAssigned = await assignFleetToRouteTrips(ibadanAbujaRoute, ibadanAbujaFleet, TRIPS_TO_ASSIGN_PER_ROUTE)

  const kanoFleet = [{ bus: vipBus, driver: vipDriver }]
  const kanoAssigned = await assignFleetToRouteTrips(lagosKanoRoute, kanoFleet, TRIPS_TO_ASSIGN_PER_ROUTE)

  const enuguFleet = [{ bus, driver }, { bus: vipBus, driver: vipDriver }]
  const enuguAssigned = await assignFleetToRouteTrips(beninEnuguRoute, enuguFleet, TRIPS_TO_ASSIGN_PER_ROUTE)

  const totalAssigned = mainAssigned + lagosAbujaAssigned + lagosPhAssigned + ibadanAbujaAssigned + kanoAssigned + enuguAssigned

  // ------------------------------------------------------------
  // Demo bookings — wiped and recreated relative to *now* every run,
  // on the main Lagos→Ibadan→Benin route only. Demo trips are
  // identified by NOT falling on that route's recurring schedule's
  // time-of-day (every schedule-generated trip departs at exactly that
  // hour:minute; every demo trip below uses an hours-from-now offset
  // that essentially never lands on it).
  // ------------------------------------------------------------
  const activeSchedule = await prisma.routeSchedule.findFirstOrThrow({ where: { routeId: mainRoute.id, active: true } })
  const scheduleHour = activeSchedule.departureTime.getUTCHours()
  const scheduleMinute = activeSchedule.departureTime.getUTCMinutes()

  const allRouteTrips = await prisma.trip.findMany({ where: { routeId: mainRoute.id }, select: { id: true, departureTime: true } })
  const demoTripIds = allRouteTrips
    .filter((t) => t.departureTime.getUTCHours() !== scheduleHour || t.departureTime.getUTCMinutes() !== scheduleMinute)
    .map((t) => t.id)
  const demoRiderIds = [rider1.id, rider2.id, rider3.id]

  if (demoTripIds.length > 0) {
    console.log(`\nClearing ${demoTripIds.length} previous demo trip(s) so they can be recreated relative to now...`)
  }
  // Any booking on a trip being wiped must have its wallet_transactions
  // cleared first, regardless of whose booking it is (onDelete: NoAction
  // on wallet_transactions.booking_id) — this route has accumulated
  // other ad-hoc test bookings from earlier manual testing that also
  // happen to fall outside the schedule's time-of-day.
  const tripBookingIds = (await prisma.booking.findMany({ where: { tripId: { in: demoTripIds } }, select: { id: true } })).map(
    (b) => b.id,
  )
  await prisma.walletTransaction.deleteMany({ where: { OR: [{ userId: { in: demoRiderIds } }, { bookingId: { in: tripBookingIds } }] } })
  await prisma.paymentIntent.deleteMany({ where: { OR: [{ userId: { in: demoRiderIds } }, { bookingId: { in: tripBookingIds } }] } })
  await prisma.complaint.deleteMany({ where: { userId: { in: demoRiderIds } } })
  await prisma.lostFoundItem.deleteMany({ where: { submittedBy: { in: [...demoRiderIds, staff.id] } } })
  await prisma.supportTicket.deleteMany({ where: { userId: { in: demoRiderIds } } })
  await prisma.tripAlert.deleteMany({ where: { createdBy: admin.id } })
  await prisma.booking.deleteMany({ where: { tripId: { in: demoTripIds } } }) // cascades booking_ratings
  await prisma.tripSeat.deleteMany({ where: { tripId: { in: demoTripIds } } })
  await prisma.trip.deleteMany({ where: { id: { in: demoTripIds } } })
  // Demo riders are dedicated seed accounts — reset to a clean starting balance each run.
  await prisma.wallet.updateMany({ where: { userId: { in: demoRiderIds } }, data: { balance: 50_000 } })

  console.log('Creating demo bookings across every status...')

  let pastTrip: Awaited<ReturnType<typeof createAssignedTrip>>
  let checkinTrip: Awaited<ReturnType<typeof createAssignedTrip>>
  let soonTrip: Awaited<ReturnType<typeof createAssignedTrip>>

  {
    // 1. Upcoming, paid, >24h out — cancel-with-refund is demoable live.
    const farTrip = await createAssignedTrip(mainRoute.id, bus.id, driver.id, 72, bus.capacity, bus.class)
    await bookWithWallet({
      userId: rider1.id,
      tripId: farTrip.trip.id,
      seatId: farTrip.seats[0].id,
      boardStopId: stopOrigin.id,
      alightStopId: stopDest.id,
      requireValidHold: false,
    })

    // 2. Upcoming, paid, <24h out — cancel-no-refund / reschedule-blocked.
    soonTrip = await createAssignedTrip(mainRoute.id, bus.id, driver.id, 10, bus.capacity, bus.class)
    await bookWithWallet({
      userId: rider1.id,
      tripId: soonTrip.trip.id,
      seatId: soonTrip.seats[0].id,
      boardStopId: stopOrigin.id,
      alightStopId: stopDest.id,
      requireValidHold: false,
    })

    // 3. Pending pay-at-park, staff-booked — Staff > Pending Payments demo.
    const payAtParkTrip = await createAssignedTrip(mainRoute.id, bus.id, driver.id, 48, bus.capacity, bus.class)
    await bookManual({
      userId: rider2.id,
      performedBy: staff.id,
      tripId: payAtParkTrip.trip.id,
      seatId: payAtParkTrip.seats[0].id,
      boardStopId: stopOrigin.id,
      alightStopId: stopDest.id,
      paymentMethod: 'pay_at_park',
    })

    // 4. Check-in demo trip: one boarded, one not — Staff > Check-in / Manifest.
    checkinTrip = await createAssignedTrip(mainRoute.id, bus.id, driver.id, 6, bus.capacity, bus.class)
    const boardedBooking = await bookWithWallet({
      userId: rider3.id,
      tripId: checkinTrip.trip.id,
      seatId: checkinTrip.seats[0].id,
      boardStopId: stopOrigin.id,
      alightStopId: stopDest.id,
      requireValidHold: false,
    })
    await prisma.booking.update({ where: { id: boardedBooking.id }, data: { boardedAt: new Date() } })
    await bookWithWallet({
      userId: rider1.id,
      tripId: checkinTrip.trip.id,
      seatId: checkinTrip.seats[1].id,
      boardStopId: stopOrigin.id,
      alightStopId: stopDest.id,
      requireValidHold: false,
    })

    // 5. Already cancelled with refund — History tab demo.
    const cancelTrip = await createAssignedTrip(mainRoute.id, bus.id, driver.id, 96, bus.capacity, bus.class)
    const toCancel = await bookWithWallet({
      userId: rider1.id,
      tripId: cancelTrip.trip.id,
      seatId: cancelTrip.seats[0].id,
      boardStopId: stopOrigin.id,
      alightStopId: stopDest.id,
      requireValidHold: false,
    })
    await prisma.booking.update({ where: { id: toCancel.id }, data: { status: 'cancelled' } })
    await refundBookingToWallet(toCancel)

    // 6. Completed trip in the past — one rated (rider1), one unrated
    // (rider3, so logging in as rider3 shows the "rate your trip" prompt).
    pastTrip = await createAssignedTrip(mainRoute.id, bus.id, driver.id, -48, bus.capacity, bus.class, 'completed')
    const ratedBooking = await bookWithWallet({
      userId: rider1.id,
      tripId: pastTrip.trip.id,
      seatId: pastTrip.seats[0].id,
      boardStopId: stopOrigin.id,
      alightStopId: stopDest.id,
      requireValidHold: false,
    })
    await prisma.booking.update({ where: { id: ratedBooking.id }, data: { status: 'completed' } })
    await prisma.bookingRating.create({
      data: { bookingId: ratedBooking.id, stars: 5, comment: 'Comfortable seats, driver was on time.' },
    })
    const unratedBooking = await bookWithWallet({
      userId: rider3.id,
      tripId: pastTrip.trip.id,
      seatId: pastTrip.seats[1].id,
      boardStopId: stopOrigin.id,
      alightStopId: stopDest.id,
      requireValidHold: false,
    })
    await prisma.booking.update({ where: { id: unratedBooking.id }, data: { status: 'completed' } })

    console.log('Created 6 demo trips with bookings covering every status.')

    // ------------------------------------------------------------
    // Complaints, lost & found, support tickets, alerts
    // ------------------------------------------------------------
    await prisma.complaint.createMany({
      data: [
        { userId: rider1.id, tripId: pastTrip.trip.id, category: 'driver_conduct', message: 'Driver was speeding for most of the trip.', status: 'open' },
        { userId: rider2.id, category: 'vehicle_condition', message: 'Air conditioning was not working.', status: 'in_review' },
        {
          userId: rider3.id,
          category: 'other',
          message: 'App kept logging me out mid-booking.',
          status: 'resolved',
          resolutionNotes: 'Reproduced and fixed a token-refresh bug — thanks for the report.',
          assignedTo: admin.id,
          resolvedAt: new Date(),
        },
      ],
    })

    await prisma.lostFoundItem.createMany({
      data: [
        { type: 'lost', tripId: pastTrip.trip.id, description: 'Blue backpack with a laptop inside.', contactInfo: rider1.phone, submittedBy: rider1.id, status: 'open' },
        { type: 'found', tripId: checkinTrip.trip.id, description: 'Black umbrella left under seat 02.', submittedBy: staff.id, homeParkId: lagos.id, status: 'open' },
        { type: 'found', description: 'Pair of reading glasses in a red case.', submittedBy: staff.id, homeParkId: lagos.id, status: 'claimed' },
        { type: 'found', description: 'Nokia phone found at the Abuja counter.', submittedBy: abujaStaff.id, homeParkId: abuja.id, status: 'open' },
      ],
    })

    await prisma.supportTicket.createMany({
      data: [
        { userId: rider1.id, category: 'payment', message: 'My wallet top-up has not reflected yet.', status: 'open' },
        { userId: rider2.id, category: 'booking', message: 'Wrong seat class showed on my ticket.', status: 'resolved' },
        { userId: rider3.id, category: 'technical', message: 'QR code on my ticket will not scan.', status: 'open' },
      ],
    })

    await prisma.tripAlert.createMany({
      data: [
        { tripId: soonTrip.trip.id, type: 'delay', message: 'This trip is running 30 minutes behind schedule.', createdBy: admin.id },
        { routeId: mainRoute.id, type: 'holiday_notice', message: 'Reduced departures during the upcoming public holiday.', createdBy: admin.id },
        { routeId: lagosKanoRoute.id, type: 'route_change', message: 'Overnight departures now board 30 minutes earlier for security checks.', createdBy: admin.id },
      ],
    })

    console.log('Created sample complaints, lost & found items, support tickets, and travel alerts.')
  }

  console.log('\nSeed complete.')
  console.log(
    `  Parks:   ${lagos.name}, ${ibadan.name}, ${benin.name}, ${abuja.name}, ${portHarcourt.name}, ${kano.name}, ${enugu.name}`,
  )
  console.log(
    `  Routes:  Lagos→Ibadan→Benin, Lagos→Abuja, Lagos→Benin→Port Harcourt, Ibadan→Abuja, Lagos→Kano, Benin→Enugu`,
  )
  console.log(`  Buses:   ${bus.plate} / ${standardBus2.plate} (standard), ${luxuryBus.plate} / ${luxuryBus2.plate} (luxury), ${vipBus.plate} (vip)`)
  console.log(`  Drivers: ${driver.name}, ${luxuryDriver.name}, ${driver2.name}, ${luxuryDriver2.name}, ${vipDriver.name}`)
  console.log(`  Admin:   ${admin.phone}`)
  console.log(`  Staff:   ${staff.phone} (home park: ${lagos.name}), ${abujaStaff.phone} (home park: ${abuja.name})`)
  console.log(`  Riders:  ${rider1.phone} (Aisha), ${rider2.phone} (Tunde), ${rider3.phone} (Ngozi) — ₦50,000 wallet each`)
  console.log(`  Trips:   ${totalAssigned} browsable upcoming trip(s) across 6 routes, plus 6 demo trips covering every booking status`)
  console.log('\nAll logins are OTP-only — codes print to this terminal (as "[sendSms] ...") in dev, no real SMS is sent.')
  console.log('Ready to demo: search Ojota Park → Benin Park in the rider app, or log in as any account above.')
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('Seed failed:', err)
    return prisma.$disconnect().finally(() => process.exit(1))
  })

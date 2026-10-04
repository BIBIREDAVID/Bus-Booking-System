import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { generateUpcomingTrips } from '../src/jobs/generateTrips'
import { bookWithWallet, bookManual } from '../src/lib/bookingTransaction'
import { refundBookingToWallet } from '../src/lib/refunds'

/**
 * Seeds everything needed for a full walkthrough demo: reference data
 * (parks/route/fares/schedule/bus/driver), an admin + park-staff +
 * three rider accounts, and real bookings in every status so every
 * screen in the app has something to show immediately — no clicking
 * through the UI first to generate data.
 *
 * Reference-data setup is idempotent (checked by re-running it against
 * real data — no duplicates). The demo-booking section is fully
 * REFRESHABLE, not just idempotent: every demo trip is tagged by
 * departing at a time-of-day that doesn't match the recurring
 * schedule (see DEMO_TRIP_MARKER below), so each run deletes any
 * previous demo trips/bookings/complaints/etc. and recreates them
 * relative to *now* — otherwise "upcoming" demo bookings would
 * silently turn into past ones a day or two after first seeding, and
 * the whole point of the seed is that it's safe to re-run before a
 * demo to reset everything to a fresh, correctly-timed state.
 *
 * Run with:
 *   cd api
 *   npx prisma db seed
 *
 * (or `npx tsx prisma/seed.ts` directly, same effect)
 */

const ADMIN_PHONE = process.env.SEED_ADMIN_PHONE ?? '+2348000000001'
const ONE_HOUR_MS = 60 * 60 * 1000
const TRIPS_TO_ASSIGN = 7

async function findOrCreatePark(data: { name: string; city: string; state: string }) {
  const existing = await prisma.park.findFirst({ where: { name: data.name } })
  if (existing) return existing
  return prisma.park.create({ data })
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

  const lagos = await findOrCreatePark({ name: 'Ojota Park', city: 'Lagos', state: 'Lagos' })
  const ibadan = await findOrCreatePark({ name: 'Challenge Park', city: 'Ibadan', state: 'Oyo' })
  const benin = await findOrCreatePark({ name: 'Benin Park', city: 'Benin City', state: 'Edo' })

  let route = await prisma.route.findFirst({ where: { originParkId: lagos.id, destParkId: benin.id } })
  const routeIsNew = !route
  if (!route) {
    route = await prisma.route.create({ data: { originParkId: lagos.id, destParkId: benin.id, durationMins: 300 } })
  }

  if (routeIsNew) {
    const stopLagos = await prisma.routeStop.create({
      data: { routeId: route.id, parkId: lagos.id, stopOrder: 1, isBoardingPoint: true },
    })
    const stopIbadan = await prisma.routeStop.create({
      data: { routeId: route.id, parkId: ibadan.id, stopOrder: 2, isBoardingPoint: true },
    })
    const stopBenin = await prisma.routeStop.create({
      data: { routeId: route.id, parkId: benin.id, stopOrder: 3, isBoardingPoint: true },
    })

    // Fares for every valid (board, alight) pair on the route — the
    // segment-aware booking logic looks up an exact match per pair, so
    // all three (not just the adjacent legs) need a row.
    await prisma.routeSegment.createMany({
      data: [
        { routeId: route.id, fromStopId: stopLagos.id, toStopId: stopIbadan.id, fareStandard: 4500, fareLuxury: 6500, fareVip: 8500 },
        { routeId: route.id, fromStopId: stopIbadan.id, toStopId: stopBenin.id, fareStandard: 4000, fareLuxury: 6000, fareVip: 8000 },
        { routeId: route.id, fromStopId: stopLagos.id, toStopId: stopBenin.id, fareStandard: 8000, fareLuxury: 11000, fareVip: 14000 },
      ],
    })

    // Daily 6:30am departure — the nightly job (see src/jobs/generateTrips.ts)
    // expands this into real trips for the next 30 days automatically.
    await prisma.routeSchedule.create({
      data: { routeId: route.id, departureTime: new Date('1970-01-01T06:30:00Z'), daysOfWeek: [0, 1, 2, 3, 4, 5, 6], active: true },
    })

    console.log(`Created route ${lagos.name} → ${benin.name} with fares and a daily schedule.`)
  } else {
    console.log(`Route ${lagos.name} → ${benin.name} already exists — skipped stops/fares/schedule.`)
  }

  // Origin/destination boarding stops, whether just created above or
  // already there from a previous run — everything below books the
  // full route (origin -> destination), so these two are all we need.
  const stopOrigin = await prisma.routeStop.findFirstOrThrow({ where: { routeId: route.id, parkId: lagos.id } })
  const stopDest = await prisma.routeStop.findFirstOrThrow({ where: { routeId: route.id, parkId: benin.id } })

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

  // Generate real trips off the schedule, then assign the seeded bus
  // to the next few so there's something browsable in search the
  // moment seeding finishes, beyond the specific demo bookings below.
  await generateUpcomingTrips()

  const upcomingTrips = await prisma.trip.findMany({
    where: { routeId: route.id, status: 'scheduled', busId: null },
    orderBy: { departureTime: 'asc' },
    take: TRIPS_TO_ASSIGN,
  })

  let assignedCount = 0
  for (const [i, trip] of upcomingTrips.entries()) {
    const useLuxury = i >= 5 // last couple get the luxury bus, for fare/class variety
    const tripBus = useLuxury ? luxuryBus : bus
    const tripDriver = useLuxury ? luxuryDriver : driver
    const existingSeats = await prisma.tripSeat.count({ where: { tripId: trip.id } })
    await prisma.$transaction(async (tx) => {
      await tx.trip.update({ where: { id: trip.id }, data: { busId: tripBus.id, driverId: tripDriver.id } })
      if (existingSeats === 0) {
        const seatNumbers = Array.from({ length: tripBus.capacity }, (_, i2) => String(i2 + 1).padStart(2, '0'))
        await tx.tripSeat.createMany({
          data: seatNumbers.map((seatNumber) => ({ tripId: trip.id, seatNumber, class: tripBus.class })),
        })
      }
    })
    assignedCount++
  }

  // ------------------------------------------------------------
  // Demo bookings — wiped and recreated relative to *now* every run.
  // Demo trips are identified by NOT falling on the recurring
  // schedule's time-of-day (every schedule-generated trip departs at
  // exactly that hour:minute; every demo trip below uses an
  // hours-from-now offset that essentially never lands on it).
  // ------------------------------------------------------------
  const activeSchedule = await prisma.routeSchedule.findFirstOrThrow({ where: { routeId: route.id, active: true } })
  const scheduleHour = activeSchedule.departureTime.getUTCHours()
  const scheduleMinute = activeSchedule.departureTime.getUTCMinutes()

  const allRouteTrips = await prisma.trip.findMany({ where: { routeId: route.id }, select: { id: true, departureTime: true } })
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

  {
    // 1. Upcoming, paid, >24h out — cancel-with-refund is demoable live.
    const farTrip = await createAssignedTrip(route.id, bus.id, driver.id, 72, bus.capacity, bus.class)
    await bookWithWallet({
      userId: rider1.id,
      tripId: farTrip.trip.id,
      seatId: farTrip.seats[0].id,
      boardStopId: stopOrigin.id,
      alightStopId: stopDest.id,
      requireValidHold: false,
    })

    // 2. Upcoming, paid, <24h out — cancel-no-refund / reschedule-blocked.
    const soonTrip = await createAssignedTrip(route.id, bus.id, driver.id, 10, bus.capacity, bus.class)
    await bookWithWallet({
      userId: rider1.id,
      tripId: soonTrip.trip.id,
      seatId: soonTrip.seats[0].id,
      boardStopId: stopOrigin.id,
      alightStopId: stopDest.id,
      requireValidHold: false,
    })

    // 3. Pending pay-at-park, staff-booked — Staff > Pending Payments demo.
    const payAtParkTrip = await createAssignedTrip(route.id, bus.id, driver.id, 48, bus.capacity, bus.class)
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
    const checkinTrip = await createAssignedTrip(route.id, bus.id, driver.id, 6, bus.capacity, bus.class)
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
    const cancelTrip = await createAssignedTrip(route.id, bus.id, driver.id, 96, bus.capacity, bus.class)
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
    const pastTrip = await createAssignedTrip(route.id, bus.id, driver.id, -48, bus.capacity, bus.class, 'completed')
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
        { routeId: route.id, type: 'holiday_notice', message: 'Reduced departures during the upcoming public holiday.', createdBy: admin.id },
      ],
    })

    console.log('Created sample complaints, lost & found items, support tickets, and travel alerts.')
  }

  console.log('\nSeed complete.')
  console.log(`  Buses:   ${bus.plate} (standard), ${luxuryBus.plate} (luxury)`)
  console.log(`  Drivers: ${driver.name}, ${luxuryDriver.name}`)
  console.log(`  Admin:   ${admin.phone}`)
  console.log(`  Staff:   ${staff.phone} (home park: ${lagos.name})`)
  console.log(`  Riders:  ${rider1.phone} (Aisha), ${rider2.phone} (Tunde), ${rider3.phone} (Ngozi) — ₦50,000 wallet each`)
  console.log(`  Trips:   ${assignedCount} browsable upcoming trip(s), plus 6 demo trips covering every booking status`)
  console.log('\nAll logins are OTP-only — codes print to this terminal (as "[sendSms] ...") in dev, no real SMS is sent.')
  console.log('Ready to demo: search Ojota Park → Benin Park in the rider app, or log in as any account above.')
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('Seed failed:', err)
    return prisma.$disconnect().finally(() => process.exit(1))
  })

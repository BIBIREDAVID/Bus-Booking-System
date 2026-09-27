import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

/**
 * Seeds the minimum reference data the app needs to be usable at all:
 * parks, a route with stops/fares, a recurring schedule, a bus, a
 * driver, and an admin account. Safe to re-run — every step checks
 * for existing data first (parks/routes have no natural unique
 * constraint to upsert against, so this uses find-then-create instead
 * of Prisma's `upsert`).
 *
 * Run with:
 *   cd api
 *   npx prisma db seed
 *
 * (or `npx tsx prisma/seed.ts` directly, same effect)
 */

const ADMIN_PHONE = process.env.SEED_ADMIN_PHONE ?? '+2348000000001'

async function findOrCreatePark(data: { name: string; city: string; state: string }) {
  const existing = await prisma.park.findFirst({ where: { name: data.name } })
  if (existing) return existing
  return prisma.park.create({ data })
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

  const bus = await prisma.bus.upsert({
    where: { plate: 'ABC-101-XY' },
    update: {},
    create: { plate: 'ABC-101-XY', capacity: 32, class: 'standard', status: 'active' },
  })

  const driver = await prisma.driver.upsert({
    where: { phone: '+2348011111111' },
    update: {},
    create: { name: 'Chinedu Okafor', phone: '+2348011111111', licenseNo: 'LIC-0001', status: 'active' },
  })

  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    update: { role: 'admin' },
    create: { phone: ADMIN_PHONE, name: 'Admin', role: 'admin' },
  })

  console.log('\nSeed complete.')
  console.log(`  Bus:    ${bus.plate}`)
  console.log(`  Driver: ${driver.name} (${driver.phone})`)
  console.log(`  Admin:  ${admin.phone} — log in via OTP (the code prints to this terminal in dev).`)
  console.log('\nNext: log in as the admin above, open Admin > Trips, and assign the bus to a generated trip.')
  console.log('(Trips generate automatically on a nightly cron — or run `npm run generate-trips` to do it now.)')
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('Seed failed:', err)
    return prisma.$disconnect().finally(() => process.exit(1))
  })

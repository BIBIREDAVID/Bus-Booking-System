import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'

export const adminReferenceRouter = Router()

adminReferenceRouter.use(requireAuth, requireRole('admin'))

// Lookup lists for admin screens (route-schedule form, bus/driver assignment).

adminReferenceRouter.get('/routes', async (_req, res) => {
  const routes = await prisma.route.findMany({
    include: { originPark: true, destPark: true },
    orderBy: { createdAt: 'asc' },
  })
  return res.status(200).json(
    routes.map((r) => ({
      id: r.id,
      label: `${r.originPark.name} → ${r.destPark.name}`,
      durationMins: r.durationMins,
    })),
  )
})

// GET /admin/routes/:id/detail — full stop list + every board/alight
// fare pair, for the Routes admin screen (read-only view of what the
// seed/route-creation already produced).
adminReferenceRouter.get('/routes/:id/detail', async (req, res) => {
  const route = await prisma.route.findUnique({
    where: { id: req.params.id },
    include: {
      originPark: true,
      destPark: true,
      routeStops: { include: { park: true }, orderBy: { stopOrder: 'asc' } },
      routeSegments: { include: { fromStop: { include: { park: true } }, toStop: { include: { park: true } } } },
    },
  })
  if (!route) return res.status(404).json({ message: 'Route not found' })

  return res.status(200).json({
    id: route.id,
    label: `${route.originPark.name} → ${route.destPark.name}`,
    durationMins: route.durationMins,
    stops: route.routeStops.map((s) => ({ id: s.id, parkName: s.park.name, stopOrder: s.stopOrder, isBoardingPoint: s.isBoardingPoint })),
    fares: route.routeSegments.map((s) => ({
      id: s.id,
      from: s.fromStop.park.name,
      to: s.toStop.park.name,
      fareStandard: s.fareStandard,
      fareLuxury: s.fareLuxury,
      fareVip: s.fareVip,
    })),
  })
})

// POST /admin/parks — create a park.
const createParkSchema = z.object({
  name: z.string().trim().min(1).max(150),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  address: z.string().trim().max(255).optional().or(z.literal('')),
})

adminReferenceRouter.post('/parks', async (req, res) => {
  const parsed = createParkSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { name, city, state, address } = parsed.data
  const park = await prisma.park.create({ data: { name, city, state, address: address || null } })
  return res.status(201).json(park)
})

// POST /admin/routes — create a route with every stop and the fare for
// every (board, alight) pair along it, in one go. legFares has one
// entry per adjacent stop pair (length = stopParkIds.length - 1); the
// fare for a non-adjacent pair is the sum of the legs between them —
// same approach the demo seed script uses.
const fareSchema = z.object({
  standard: z.number().positive(),
  luxury: z.number().positive(),
  vip: z.number().positive(),
})

const createRouteSchema = z
  .object({
    stopParkIds: z.array(z.string().uuid()).min(2, 'A route needs at least an origin and a destination'),
    legFares: z.array(fareSchema),
    durationMins: z.number().int().positive(),
  })
  .refine((data) => data.legFares.length === data.stopParkIds.length - 1, {
    message: 'legFares must have exactly one entry per adjacent stop pair (stops.length - 1)',
    path: ['legFares'],
  })

adminReferenceRouter.post('/routes', async (req, res) => {
  const parsed = createRouteSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { stopParkIds, legFares, durationMins } = parsed.data

  const parks = await prisma.park.findMany({ where: { id: { in: stopParkIds } } })
  if (parks.length !== new Set(stopParkIds).size) {
    return res.status(400).json({ message: 'One or more stopParkIds do not match an existing park' })
  }

  const route = await prisma.$transaction(async (tx) => {
    const route = await tx.route.create({
      data: { originParkId: stopParkIds[0], destParkId: stopParkIds[stopParkIds.length - 1], durationMins },
    })

    const routeStops = []
    for (let i = 0; i < stopParkIds.length; i++) {
      const stop = await tx.routeStop.create({
        data: { routeId: route.id, parkId: stopParkIds[i], stopOrder: i + 1, isBoardingPoint: true },
      })
      routeStops.push(stop)
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
    await tx.routeSegment.createMany({ data: segmentsData })

    return route
  })

  return res.status(201).json({ id: route.id })
})

// ------------------------------------------------------------
// Fleet — buses
// ------------------------------------------------------------

adminReferenceRouter.get('/buses', async (_req, res) => {
  const buses = await prisma.bus.findMany({ orderBy: { plate: 'asc' } })
  return res.status(200).json(buses)
})

const createBusSchema = z.object({
  plate: z.string().trim().min(1).max(20),
  capacity: z.number().int().positive(),
  class: z.enum(['standard', 'luxury', 'vip']),
  status: z.enum(['active', 'maintenance']).optional(),
})

adminReferenceRouter.post('/buses', async (req, res) => {
  const parsed = createBusSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const existing = await prisma.bus.findUnique({ where: { plate: parsed.data.plate } })
  if (existing) return res.status(409).json({ message: 'A bus with that plate already exists' })

  const bus = await prisma.bus.create({ data: { ...parsed.data, status: parsed.data.status ?? 'active' } })
  return res.status(201).json(bus)
})

const updateBusSchema = z.object({ status: z.enum(['active', 'maintenance']) })

adminReferenceRouter.patch('/buses/:id', async (req, res) => {
  const parsed = updateBusSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const bus = await prisma.bus.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null)
  if (!bus) return res.status(404).json({ message: 'Bus not found' })
  return res.status(200).json(bus)
})

// ------------------------------------------------------------
// Fleet — drivers (reference data; login is separate, see
// POST /admin/drivers/:id/create-login in admin/users.ts)
// ------------------------------------------------------------

adminReferenceRouter.get('/drivers', async (_req, res) => {
  const drivers = await prisma.driver.findMany({ orderBy: { name: 'asc' } })
  return res.status(200).json(
    drivers.map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      licenseNo: d.licenseNo,
      status: d.status,
      hasLogin: d.userId !== null,
    })),
  )
})

const createDriverSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number in international format'),
  licenseNo: z.string().trim().min(1).max(50),
  status: z.enum(['active', 'inactive']).optional(),
})

adminReferenceRouter.post('/drivers', async (req, res) => {
  const parsed = createDriverSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { name, phone, licenseNo, status } = parsed.data

  const existingPhone = await prisma.driver.findUnique({ where: { phone } })
  if (existingPhone) return res.status(409).json({ message: 'A driver with that phone number already exists' })
  const existingLicense = await prisma.driver.findUnique({ where: { licenseNo } })
  if (existingLicense) return res.status(409).json({ message: 'A driver with that license number already exists' })

  const driver = await prisma.driver.create({ data: { name, phone, licenseNo, status: status ?? 'active' } })
  return res.status(201).json({ id: driver.id, name: driver.name, phone: driver.phone, licenseNo: driver.licenseNo, status: driver.status, hasLogin: false })
})

const updateDriverSchema = z.object({ status: z.enum(['active', 'inactive']) })

adminReferenceRouter.patch('/drivers/:id', async (req, res) => {
  const parsed = updateDriverSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const driver = await prisma.driver.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null)
  if (!driver) return res.status(404).json({ message: 'Driver not found' })
  return res.status(200).json({ id: driver.id, name: driver.name, phone: driver.phone, licenseNo: driver.licenseNo, status: driver.status, hasLogin: driver.userId !== null })
})

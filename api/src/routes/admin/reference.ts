import { Router } from 'express'
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

adminReferenceRouter.get('/buses', async (_req, res) => {
  const buses = await prisma.bus.findMany({ orderBy: { plate: 'asc' } })
  return res.status(200).json(buses)
})

adminReferenceRouter.get('/drivers', async (_req, res) => {
  const drivers = await prisma.driver.findMany({ orderBy: { name: 'asc' } })
  return res.status(200).json(drivers)
})

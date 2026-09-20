import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

export const parksRouter = Router()

parksRouter.use(requireAuth)

parksRouter.get('/', async (_req, res) => {
  const parks = await prisma.park.findMany({ orderBy: { name: 'asc' } })
  return res.status(200).json(parks.map((p) => ({ id: p.id, name: p.name, city: p.city, state: p.state })))
})

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

export const lostFoundRouter = Router()

lostFoundRouter.use(requireAuth)

function serialize(item: {
  id: string
  type: string
  description: string
  contactInfo: string | null
  status: string
  createdAt: Date
  trip: { departureTime: Date; route: { originPark: { name: string }; destPark: { name: string } } } | null
  homePark: { name: string } | null
}) {
  return {
    id: item.id,
    type: item.type,
    description: item.description,
    contactInfo: item.contactInfo,
    status: item.status,
    createdAt: item.createdAt,
    tripLabel: item.trip
      ? `${item.trip.route.originPark.name} → ${item.trip.route.destPark.name} (${item.trip.departureTime.toISOString()})`
      : null,
    parkName: item.homePark?.name ?? null,
  }
}

const include = {
  trip: { include: { route: { include: { originPark: true, destPark: true } } } },
  homePark: true,
} as const

// ------------------------------------------------------------
// GET /lost-found — browse found items (searchable by description,
// route, and date) or list the rider's own lost reports.
// ------------------------------------------------------------

const listQuerySchema = z.object({
  type: z.enum(['lost', 'found']).optional(),
  query: z.string().trim().optional(),
  routeId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mine: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
})

lostFoundRouter.get('/', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Invalid query' })
  const { type, query, routeId, date, mine } = parsed.data

  let dateFilter: { gte: Date; lt: Date } | undefined
  if (date) {
    const [year, month, day] = date.split('-').map(Number)
    dateFilter = { gte: new Date(Date.UTC(year, month - 1, day)), lt: new Date(Date.UTC(year, month - 1, day + 1)) }
  }

  const items = await prisma.lostFoundItem.findMany({
    where: {
      ...(mine ? { submittedBy: req.user!.id } : {}),
      ...(type && { type }),
      ...(query && { description: { contains: query, mode: 'insensitive' } }),
      ...((routeId || dateFilter) && {
        trip: {
          ...(routeId && { routeId }),
          ...(dateFilter && { departureTime: dateFilter }),
        },
      }),
    },
    include,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return res.status(200).json(items.map(serialize))
})

// ------------------------------------------------------------
// POST /lost-found — report a lost item.
// ------------------------------------------------------------

const createSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  contactInfo: z.string().trim().max(200).optional(),
  tripId: z.string().uuid().optional(),
})

lostFoundRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { description, contactInfo, tripId } = parsed.data

  if (tripId) {
    const owns = await prisma.booking.findFirst({ where: { tripId, userId: req.user!.id } })
    if (!owns) return res.status(400).json({ message: 'tripId does not match one of your bookings' })
  }

  const item = await prisma.lostFoundItem.create({
    data: { type: 'lost', description, contactInfo, tripId, submittedBy: req.user!.id },
    include,
  })
  return res.status(201).json(serialize(item))
})

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'

export const adminRouteSchedulesRouter = Router()

adminRouteSchedulesRouter.use(requireAuth, requireRole('admin'))

// route_schedules.departure_time is a Postgres TIME — Prisma represents
// it as a DateTime, so we accept/emit "HH:mm" over the wire and convert
// using a fixed epoch date. Only the UTC hour/minute ever get read back
// out (see jobs/generateTrips.ts), so the epoch date itself doesn't
// matter as long as we're consistent.
function timeStringToDate(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(Date.UTC(1970, 0, 1, hours, minutes))
}

function dateToTimeString(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

function serialize(schedule: {
  id: string
  routeId: string
  departureTime: Date
  daysOfWeek: number[]
  active: boolean
  createdAt: Date
}) {
  return {
    id: schedule.id,
    routeId: schedule.routeId,
    departureTime: dateToTimeString(schedule.departureTime),
    daysOfWeek: schedule.daysOfWeek,
    active: schedule.active,
    createdAt: schedule.createdAt,
  }
}

const baseSchema = z.object({
  routeId: z.string().uuid(),
  departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm format'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one day'),
  active: z.boolean().optional(),
})

adminRouteSchedulesRouter.get('/route-schedules', async (req, res) => {
  const routeId = typeof req.query.routeId === 'string' ? req.query.routeId : undefined
  const schedules = await prisma.routeSchedule.findMany({
    where: routeId ? { routeId } : undefined,
    orderBy: { createdAt: 'asc' },
  })
  return res.status(200).json(schedules.map(serialize))
})

adminRouteSchedulesRouter.post('/route-schedules', async (req, res) => {
  const parsed = baseSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }
  const { routeId, departureTime, daysOfWeek, active } = parsed.data

  const route = await prisma.route.findUnique({ where: { id: routeId } })
  if (!route) return res.status(400).json({ message: 'routeId does not match an existing route' })

  const schedule = await prisma.routeSchedule.create({
    data: {
      routeId,
      departureTime: timeStringToDate(departureTime),
      daysOfWeek,
      active: active ?? true,
    },
  })
  return res.status(201).json(serialize(schedule))
})

const updateSchema = baseSchema.partial()

adminRouteSchedulesRouter.patch('/route-schedules/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' })
  }

  const existing = await prisma.routeSchedule.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ message: 'Schedule not found' })

  if (parsed.data.routeId) {
    const route = await prisma.route.findUnique({ where: { id: parsed.data.routeId } })
    if (!route) return res.status(400).json({ message: 'routeId does not match an existing route' })
  }

  const schedule = await prisma.routeSchedule.update({
    where: { id: req.params.id },
    data: {
      ...(parsed.data.routeId && { routeId: parsed.data.routeId }),
      ...(parsed.data.departureTime && { departureTime: timeStringToDate(parsed.data.departureTime) }),
      ...(parsed.data.daysOfWeek && { daysOfWeek: parsed.data.daysOfWeek }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
    },
  })
  return res.status(200).json(serialize(schedule))
})

adminRouteSchedulesRouter.delete('/route-schedules/:id', async (req, res) => {
  const existing = await prisma.routeSchedule.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ message: 'Schedule not found' })

  await prisma.routeSchedule.delete({ where: { id: req.params.id } })
  return res.status(204).send()
})

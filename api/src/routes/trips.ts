import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { getSeatMap } from '../lib/seatMap'
import { NotFoundError, SegmentValidationError } from '../lib/segments'

export const tripsRouter = Router()

tripsRouter.use(requireAuth)

const seatMapQuerySchema = z.object({
  boardStopId: z.string().uuid(),
  alightStopId: z.string().uuid(),
})

tripsRouter.get('/:tripId/seat-map', async (req, res) => {
  const parsed = seatMapQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid query' })
  }

  try {
    const seats = await getSeatMap(req.params.tripId, parsed.data.boardStopId, parsed.data.alightStopId)
    return res.status(200).json({ seats })
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ message: err.message })
    if (err instanceof SegmentValidationError) return res.status(400).json({ message: err.message })
    throw err
  }
})

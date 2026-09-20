import { Router } from 'express'
import { staffTripsRouter } from './trips'
import { staffBookingsRouter } from './bookings'
import { staffCheckinRouter } from './checkin'
import { staffManifestRouter } from './manifest'
import { staffLostFoundRouter } from './lostFound'

export const staffRouter = Router()

staffRouter.use(staffTripsRouter)
staffRouter.use(staffBookingsRouter)
staffRouter.use(staffCheckinRouter)
staffRouter.use(staffManifestRouter)
staffRouter.use(staffLostFoundRouter)

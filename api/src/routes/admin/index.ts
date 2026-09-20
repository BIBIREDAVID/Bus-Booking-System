import { Router } from 'express'
import { adminUsersRouter } from './users'
import { adminReferenceRouter } from './reference'
import { adminRouteSchedulesRouter } from './routeSchedules'
import { adminTripsRouter } from './trips'
import { adminBookingsRouter } from './bookings'
import { adminPaymentsRouter } from './payments'
import { adminReportsRouter } from './reports'
import { adminAlertsRouter } from './alerts'
import { adminComplaintsRouter } from './complaints'
import { adminSupportRouter } from './support'

export const adminRouter = Router()

adminRouter.use(adminUsersRouter)
adminRouter.use(adminReferenceRouter)
adminRouter.use(adminRouteSchedulesRouter)
adminRouter.use(adminTripsRouter)
adminRouter.use(adminBookingsRouter)
adminRouter.use(adminPaymentsRouter)
adminRouter.use(adminReportsRouter)
adminRouter.use(adminAlertsRouter)
adminRouter.use(adminComplaintsRouter)
adminRouter.use(adminSupportRouter)

import { Router } from 'express'
import { driverTripsRouter } from './trips'
import { driverManifestRouter } from './manifest'

export const driverRouter = Router()

driverRouter.use(driverTripsRouter)
driverRouter.use(driverManifestRouter)

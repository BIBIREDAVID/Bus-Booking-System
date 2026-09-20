import express from 'express'
import cors from 'cors'
import { healthRouter } from './routes/health'
import { authRouter } from './routes/auth'
import { adminRouter } from './routes/admin'
import { searchRouter } from './routes/search'
import { tripsRouter } from './routes/trips'
import { bookingsRouter } from './routes/bookings'
import { parksRouter } from './routes/parks'
import { walletRouter } from './routes/wallet'
import { paymentsWebhookRouter } from './routes/paymentsWebhook'
import { staffRouter } from './routes/staff'
import { alertsRouter } from './routes/alerts'
import { complaintsRouter } from './routes/complaints'
import { lostFoundRouter } from './routes/lostFound'
import { supportRouter } from './routes/support'

export function createApp() {
  const app = express()

  const allowedOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173'
  app.use(cors({ origin: allowedOrigin, credentials: true }))

  // Webhook signature verification needs the exact raw bytes the
  // gateway signed — mounted with express.raw() *before* the general
  // express.json() below, so this path never gets its body parsed
  // (and thus reserialization-mismatched) ahead of time.
  app.use('/payments/webhook', express.raw({ type: 'application/json' }), paymentsWebhookRouter)

  app.use(express.json())

  app.use('/health', healthRouter)
  app.use('/auth', authRouter)
  app.use('/admin', adminRouter)
  app.use('/search', searchRouter)
  app.use('/trips', tripsRouter)
  app.use('/bookings', bookingsRouter)
  app.use('/parks', parksRouter)
  app.use('/wallet', walletRouter)
  app.use('/staff', staffRouter)
  app.use('/alerts', alertsRouter)
  app.use('/complaints', complaintsRouter)
  app.use('/lost-found', lostFoundRouter)
  app.use('/support-tickets', supportRouter)

  return app
}

import 'dotenv/config'
import { prisma } from '../lib/prisma'

/**
 * Deletes seat_holds rows past their expiry, freeing those seats back
 * to availability. Not required for correctness — the seat-map and
 * hold-seat queries already filter on expires_at > now() — this is
 * purely hygiene so the table doesn't grow unbounded with dead rows.
 */
export async function purgeExpiredHolds() {
  const result = await prisma.seatHold.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  console.log(`[purgeExpiredHolds] deleted ${result.count} expired hold(s)`)
  return result.count
}

// Allows this to be invoked directly by an external scheduler.
if (require.main === module) {
  purgeExpiredHolds()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[purgeExpiredHolds] failed', err)
      return prisma.$disconnect().finally(() => process.exit(1))
    })
}

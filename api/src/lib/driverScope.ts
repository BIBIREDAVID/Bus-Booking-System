import { prisma } from './prisma'
import { ForbiddenError } from './segments'

/**
 * Resolves the Driver (fleet reference) record linked to a driver's
 * login account. A driver User always has exactly one linked Driver
 * row (created together in admin/users.ts's create-login endpoint) —
 * missing here means the link was broken after the fact, which we
 * treat as a hard error rather than silently returning no trips.
 */
export async function requireDriverProfile(userId: string) {
  const driver = await prisma.driver.findUnique({ where: { userId } })
  if (!driver) throw new ForbiddenError('No driver profile is linked to this account')
  return driver
}

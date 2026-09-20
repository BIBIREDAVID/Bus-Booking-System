import crypto from 'node:crypto'
import { prisma } from './prisma'

const REFRESH_EXPIRES_IN_DAYS = Number(process.env.JWT_REFRESH_EXPIRES_DAYS ?? 30)

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000)

  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  })

  return token
}

/**
 * Validates a refresh token, revokes it, and issues a replacement
 * (rotation — limits the damage if a refresh token is ever stolen).
 * Returns null if the token is missing, expired, or already revoked.
 */
export async function rotateRefreshToken(
  oldToken: string,
): Promise<{ token: string; userId: string } | null> {
  const tokenHash = hashToken(oldToken)

  const existing = await prisma.refreshToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
  })
  if (!existing) return null

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  })

  const token = await issueRefreshToken(existing.userId)
  return { token, userId: existing.userId }
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

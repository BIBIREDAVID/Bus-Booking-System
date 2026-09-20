import jwt from 'jsonwebtoken'
import type { UserRole } from '@prisma/client'

export interface AccessTokenPayload {
  sub: string
  role: UserRole
  homeParkId: string | null
}

const ACCESS_SECRET = process.env.JWT_SECRET
if (!ACCESS_SECRET) throw new Error('JWT_SECRET is not set')

const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m'

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET as string, { expiresIn: ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] })
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET as string) as AccessTokenPayload
}

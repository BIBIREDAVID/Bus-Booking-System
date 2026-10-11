import type { NextFunction, Request, Response } from 'express'
import type { UserRole } from '@prisma/client'
import { verifyAccessToken } from '../lib/jwt'
import { prisma } from '../lib/prisma'

export interface AuthedUser {
  id: string
  email: string
  phone: string | null
  role: UserRole
  homeParkId: string | null
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing bearer token' })
  }

  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length))

    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) return res.status(401).json({ message: 'User not found' })

    req.user = { id: user.id, email: user.email, phone: user.phone, role: user.role, homeParkId: user.homeParkId }
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

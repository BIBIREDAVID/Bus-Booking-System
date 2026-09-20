import type { NextFunction, Request, Response } from 'express'
import type { UserRole } from '@prisma/client'

/**
 * Route-level authorization. Must run after requireAuth.
 * Usage: router.post('/x', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthenticated' })
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' })
    next()
  }
}

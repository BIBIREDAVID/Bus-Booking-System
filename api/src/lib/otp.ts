import crypto from 'node:crypto'
import bcrypt from 'bcrypt'

export function generateOtpCode(): string {
  // crypto.randomInt is rejection-sampled, so this is uniform over
  // 000000-999999 (no modulo bias).
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export function hashOtpCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10)
}

export function verifyOtpCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash)
}

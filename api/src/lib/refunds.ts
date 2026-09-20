import type { Booking } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Refunds a booking's fare to the rider's wallet: inserts a `refund`
 * wallet_transactions row and credits the balance, atomically. Callers
 * are responsible for only invoking this for bookings that were
 * actually paid (status was 'booked') — there's nothing to refund for
 * a 'reserved_unpaid' (pay-at-park) booking that was never paid.
 */
export async function refundBookingToWallet(booking: Pick<Booking, 'id' | 'userId' | 'amount'>): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO wallets (user_id, balance) VALUES (${booking.userId}::uuid, 0)
      ON CONFLICT (user_id) DO NOTHING
    `
    await tx.$queryRaw`SELECT balance FROM wallets WHERE user_id = ${booking.userId}::uuid FOR UPDATE`
    await tx.wallet.update({
      where: { userId: booking.userId },
      data: { balance: { increment: booking.amount }, updatedAt: new Date() },
    })
    await tx.walletTransaction.create({
      data: { userId: booking.userId, type: 'refund', amount: booking.amount, bookingId: booking.id },
    })
  })
}

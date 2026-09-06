import { withUniqueRetry } from './number-generator.js';

/**
 * Generates the next sequential reservation number for a given branch and year.
 *
 * Format: RES-{branchCode}-{year}-{sequence}
 * Example: RES-RYD-2026-00001
 *
 * Properties:
 * - Sequential per branch per year (restarts at 00001 each calendar year)
 * - Thread-safe: uses `withUniqueRetry` to handle P2002 unique constraint races
 * - No duplicate numbers under concurrent requests
 * - Year rollover handled automatically via the `year` parameter (defaults to current year)
 * - Reuses existing database infrastructure — no additional Redis or external system
 *
 * @param prisma  - Prisma client or transaction client (any to avoid tight coupling)
 * @param branchCode - Short branch identifier, e.g. "RYD" (first 3 chars of branch nameEn)
 * @param year - Year for the sequence; defaults to current calendar year
 */
export async function generateReservationNumber(
  prisma: any,
  branchCode: string,
  year: number = new Date().getFullYear(),
): Promise<string> {
  const prefix = `RES-${branchCode.toUpperCase()}-${year}-`;

  const lastReservation = await prisma.reservation.findFirst({
    where: {
      reservationNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      reservationNumber: 'desc',
    },
    select: {
      reservationNumber: true,
    },
  });

  let nextSeq = 1;
  if (lastReservation?.reservationNumber) {
    const lastSeqStr = lastReservation.reservationNumber.replace(prefix, '');
    const lastSeq = parseInt(lastSeqStr, 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }

  return `${prefix}${nextSeq.toString().padStart(5, '0')}`;
}

/**
 * Thread-safe wrapper: generates a unique reservation number and immediately
 * attempts to use it inside a caller-provided operation. Retries up to 5 times
 * on P2002 unique constraint violations (race condition protection).
 *
 * Usage:
 * ```ts
 * const reservationNumber = await generateReservationNumberSafe(
 *   prisma, branchCode, async (num) => {
 *     return tx.reservation.create({ data: { reservationNumber: num, ... } });
 *   }
 * );
 * ```
 */
export async function generateReservationNumberSafe<T>(
  prisma: any,
  branchCode: string,
  operation: (reservationNumber: string) => Promise<T>,
  year: number = new Date().getFullYear(),
): Promise<T> {
  return withUniqueRetry(async () => {
    const reservationNumber = await generateReservationNumber(prisma, branchCode, year);
    return operation(reservationNumber);
  });
}

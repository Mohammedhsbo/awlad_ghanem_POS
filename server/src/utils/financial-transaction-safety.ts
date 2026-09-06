/**
 * TASK-012: Financial Transaction Safety Utilities
 * 
 * Provides utilities for safe financial operations with:
 * - Row-level locking
 * - Optimistic locking
 * - Deadlock prevention
 * - Transaction retry logic
 * - Concurrency protection
 */

import { Prisma } from "@prisma/client";
import { ConflictException, BadRequestException } from "@nestjs/common";

/**
 * Lock invoice with FOR UPDATE to prevent concurrent modifications
 * Returns locked invoice data
 */
export async function lockInvoiceForUpdate(
  tx: Prisma.TransactionClient,
  invoiceId: string
): Promise<{
  id: string;
  status: string;
  totalAmount: any;
  paidAmount: any;
  remainingAmount: any;
  branchId: string;
  customerId: string;
  updatedAt: Date;
}> {
  const result = await tx.$queryRaw<Array<any>>`
    SELECT 
      id, status, "totalAmount", "paidAmount", "remainingAmount",
      "branchId", "customerId", "updatedAt"
    FROM "Invoice"
    WHERE id = ${invoiceId}::uuid
    FOR UPDATE
  `;

  if (!result || result.length === 0) {
    throw new BadRequestException({
      code: "INVOICE_NOT_FOUND",
      message: "Invoice not found",
    });
  }

  return result[0];
}

/**
 * Lock payment with FOR UPDATE to prevent concurrent modifications
 * Returns locked payment data
 */
export async function lockPaymentForUpdate(
  tx: Prisma.TransactionClient,
  paymentId: string
): Promise<{
  id: string;
  status: string;
  amount: any;
  invoiceId: string;
  branchId: string;
  customerId: string;
  updatedAt: Date;
}> {
  const result = await tx.$queryRaw<Array<any>>`
    SELECT 
      id, status, amount, "invoiceId", "branchId", "customerId", "updatedAt"
    FROM "Payment"
    WHERE id = ${paymentId}::uuid
    FOR UPDATE
  `;

  if (!result || result.length === 0) {
    throw new BadRequestException({
      code: "PAYMENT_NOT_FOUND",
      message: "Payment not found",
    });
  }

  return result[0];
}

/**
 * Lock payment and its refunds with FOR UPDATE
 * Returns locked payment with refunds
 */
export async function lockPaymentWithRefunds(
  tx: Prisma.TransactionClient,
  paymentId: string
): Promise<{
  payment: {
    id: string;
    status: string;
    amount: any;
    invoiceId: string;
    branchId: string;
    updatedAt: Date;
  };
  refunds: Array<{
    id: string;
    amount: any;
    status: string;
  }>;
}> {
  // Lock payment first
  const payment = await lockPaymentForUpdate(tx, paymentId);

  // Lock all refunds for this payment
  const refunds = await tx.$queryRaw<Array<any>>`
    SELECT id, amount, status
    FROM "Refund"
    WHERE "paymentId" = ${paymentId}::uuid
    FOR UPDATE
  `;

  return {
    payment,
    refunds,
  };
}

/**
 * Validate invoice balance integrity
 * Ensures: paidAmount + remainingAmount = totalAmount
 */
export function validateInvoiceBalance(invoice: {
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
}): void {
  const expectedRemaining = invoice.totalAmount - invoice.paidAmount;
  const actualRemaining = invoice.remainingAmount;

  // Allow for floating point precision issues (within 0.01)
  const diff = Math.abs(expectedRemaining - actualRemaining);

  if (diff > 0.01) {
    throw new ConflictException({
      code: "INVOICE_BALANCE_CORRUPTION",
      message: `Invoice balance integrity check failed: expected ${expectedRemaining}, got ${actualRemaining}`,
    });
  }
}

/**
 * Validate payment + refunds = payment amount
 * Ensures: sum(refunds) <= payment.amount
 */
export function validatePaymentRefundBalance(
  paymentAmount: number,
  totalRefunded: number
): void {
  if (totalRefunded > paymentAmount + 0.01) {
    // Allow 0.01 precision
    throw new ConflictException({
      code: "PAYMENT_REFUND_CORRUPTION",
      message: `Refund integrity check failed: refunds (${totalRefunded}) exceed payment (${paymentAmount})`,
    });
  }
}

/**
 * Check for negative amounts
 */
export function validateNoNegativeAmounts(amounts: Record<string, number>): void {
  for (const [key, value] of Object.entries(amounts)) {
    if (value < -0.01) {
      // Allow -0.01 for floating point precision
      throw new ConflictException({
        code: "NEGATIVE_AMOUNT",
        message: `Negative amount detected: ${key} = ${value}`,
      });
    }
  }
}

/**
 * Optimistic locking check using updatedAt timestamp
 * Throws if record was modified since last read
 */
export function checkOptimisticLock(
  recordName: string,
  expectedUpdatedAt: Date,
  actualUpdatedAt: Date
): void {
  if (
    expectedUpdatedAt.getTime() !== actualUpdatedAt.getTime()
  ) {
    throw new ConflictException({
      code: "CONCURRENT_UPDATE_CONFLICT",
      message: `${recordName} was modified by another operation. Please retry.`,
    });
  }
}

/**
 * Retry transaction on deadlock
 * Prisma error code P2034 = deadlock detected
 */
export async function retryOnDeadlock<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 100
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check if it's a deadlock error
      const isDeadlock =
        error?.code === "P2034" || // Prisma deadlock
        error?.code === "40P01" || // PostgreSQL deadlock
        error?.message?.includes("deadlock");

      if (!isDeadlock || attempt === maxRetries) {
        throw error;
      }

      // Wait before retry with exponential backoff
      const delay = delayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Create idempotency key for financial operations
 */
export function createIdempotencyKey(
  operation: string,
  entityId: string,
  timestamp?: number
): string {
  const ts = timestamp || Date.now();
  return `${operation}-${entityId}-${ts}`;
}

/**
 * Validate idempotency key format
 */
export function validateIdempotencyKey(key: string): boolean {
  // Must be at least 10 characters
  if (key.length < 10) {
    return false;
  }

  // Must contain only allowed characters
  if (!/^[a-zA-Z0-9\-_]+$/.test(key)) {
    return false;
  }

  return true;
}

/**
 * Clean up expired idempotency keys (older than 24 hours)
 * Should be run periodically
 */
export async function cleanupExpiredIdempotencyKeys(
  prisma: Prisma.TransactionClient | any
): Promise<number> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Note: This assumes payments have createdAt field
  const result = await prisma.payment.deleteMany({
    where: {
      createdAt: {
        lt: twentyFourHoursAgo,
      },
      status: "pending", // Only clean up pending payments
    },
  });

  return result.count;
}

/**
 * Safe decimal addition (avoids floating point issues)
 */
export function safeAdd(...numbers: number[]): number {
  // Convert to cents, add, convert back
  const total = numbers.reduce((sum, n) => {
    return sum + Math.round(n * 100);
  }, 0);

  return total / 100;
}

/**
 * Safe decimal subtraction
 */
export function safeSubtract(a: number, b: number): number {
  return Math.round((a * 100 - b * 100)) / 100;
}

/**
 * Safe decimal multiplication
 */
export function safeMultiply(a: number, b: number): number {
  return Math.round(a * b * 100) / 100;
}

/**
 * Compare decimals safely (with precision tolerance)
 */
export function decimalsEqual(
  a: number,
  b: number,
  tolerance: number = 0.01
): boolean {
  return Math.abs(a - b) < tolerance;
}

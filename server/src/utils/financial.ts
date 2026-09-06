import { InvoiceStatus, PaymentStatus, PaymentMethod } from "@motorcycle-system/shared-types";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Financial Business Logic
 * TASK-004: Core financial calculations and validations for SPEC-008
 */

// ─────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────

export function isInvoiceEditable(status: InvoiceStatus): boolean {
  return status === InvoiceStatus.DRAFT;
}

export function isInvoiceCancellable(status: InvoiceStatus, paidAmount: number): boolean {
  // Can only cancel if not paid or partially paid
  return (
    (status === InvoiceStatus.DRAFT ||
      status === InvoiceStatus.ISSUED) &&
    paidAmount === 0
  );
}

export function isPaymentRefundable(status: PaymentStatus): boolean {
  return status === PaymentStatus.COMPLETED;
}

// ─────────────────────────────────────────────────────────
// Financial Calculations
// ─────────────────────────────────────────────────────────

/**
 * Calculates remaining balance for an invoice
 * Formula: totalAmount - paidAmount
 */
export function calculateRemainingAmount(
  totalAmount: number,
  paidAmount: number
): number {
  const remaining = totalAmount - paidAmount;
  return Math.max(0, Number(remaining.toFixed(2)));
}

/**
 * Calculates the total refunded amount for a payment
 */
export function calculateTotalRefunded(refunds: Array<{ amount: number }>): number {
  const total = refunds.reduce((sum, refund) => sum + refund.amount, 0);
  return Number(total.toFixed(2));
}

/**
 * Calculates available amount for refund
 * Formula: paymentAmount - totalRefunded
 */
export function calculateAvailableForRefund(
  paymentAmount: number,
  totalRefunded: number
): number {
  const available = paymentAmount - totalRefunded;
  return Math.max(0, Number(available.toFixed(2)));
}

/**
 * Calculates cash change
 * Formula: amountReceived - paymentAmount
 */
export function calculateCashChange(
  amountReceived: number,
  paymentAmount: number
): number {
  const change = amountReceived - paymentAmount;
  return Number(change.toFixed(2));
}

/**
 * Rounds financial amount to 2 decimal places
 */
export function roundFinancial(amount: number): number {
  return Number(amount.toFixed(2));
}

// ─────────────────────────────────────────────────────────
// Invoice Status Transitions
// ─────────────────────────────────────────────────────────

/**
 * Determines the new invoice status based on payment
 */
export function determineInvoiceStatus(
  totalAmount: number,
  paidAmount: number,
  currentStatus: InvoiceStatus
): InvoiceStatus {
  // If cancelled or refunded, don't change
  if (
    currentStatus === InvoiceStatus.CANCELLED ||
    currentStatus === InvoiceStatus.REFUNDED
  ) {
    return currentStatus;
  }

  const remaining = calculateRemainingAmount(totalAmount, paidAmount);

  if (paidAmount === 0) {
    return currentStatus === InvoiceStatus.DRAFT
      ? InvoiceStatus.DRAFT
      : InvoiceStatus.ISSUED;
  }

  if (remaining === 0) {
    return InvoiceStatus.PAID;
  }

  if (paidAmount > totalAmount) {
    return InvoiceStatus.OVERPAID;
  }

  return InvoiceStatus.PARTIALLY_PAID;
}

/**
 * Validates invoice status transition
 */
export function isValidInvoiceTransition(
  from: InvoiceStatus,
  to: InvoiceStatus
): boolean {
  const validTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
    [InvoiceStatus.DRAFT]: [InvoiceStatus.ISSUED, InvoiceStatus.CANCELLED],
    [InvoiceStatus.ISSUED]: [
      InvoiceStatus.PARTIALLY_PAID,
      InvoiceStatus.PAID,
      InvoiceStatus.OVERPAID,
      InvoiceStatus.CANCELLED,
    ],
    [InvoiceStatus.PARTIALLY_PAID]: [
      InvoiceStatus.PAID,
      InvoiceStatus.OVERPAID,
      InvoiceStatus.CANCELLED,
    ],
    [InvoiceStatus.PAID]: [InvoiceStatus.OVERPAID, InvoiceStatus.REFUNDED],
    [InvoiceStatus.OVERPAID]: [InvoiceStatus.REFUNDED],
    [InvoiceStatus.CANCELLED]: [], // Terminal state
    [InvoiceStatus.REFUNDED]: [], // Terminal state
  };

  return validTransitions[from]?.includes(to) ?? false;
}

// ─────────────────────────────────────────────────────────
// Payment Status Transitions
// ─────────────────────────────────────────────────────────

/**
 * Determines payment status based on refunds
 */
export function determinePaymentStatus(
  paymentAmount: number,
  totalRefunded: number,
  currentStatus: PaymentStatus
): PaymentStatus {
  // If failed or cancelled, don't change
  if (
    currentStatus === PaymentStatus.FAILED ||
    currentStatus === PaymentStatus.CANCELLED
  ) {
    return currentStatus;
  }

  if (totalRefunded === 0) {
    return currentStatus;
  }

  if (totalRefunded >= paymentAmount) {
    return PaymentStatus.REFUNDED;
  }

  return PaymentStatus.PARTIALLY_REFUNDED;
}

/**
 * Validates payment status transition
 */
export function isValidPaymentTransition(
  from: PaymentStatus,
  to: PaymentStatus
): boolean {
  const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
    [PaymentStatus.PENDING]: [
      PaymentStatus.COMPLETED,
      PaymentStatus.FAILED,
      PaymentStatus.CANCELLED,
    ],
    [PaymentStatus.COMPLETED]: [
      PaymentStatus.REFUNDED,
      PaymentStatus.PARTIALLY_REFUNDED,
    ],
    [PaymentStatus.FAILED]: [], // Terminal state
    [PaymentStatus.CANCELLED]: [], // Terminal state
    [PaymentStatus.REFUNDED]: [], // Terminal state
    [PaymentStatus.PARTIALLY_REFUNDED]: [PaymentStatus.REFUNDED],
  };

  return validTransitions[from]?.includes(to) ?? false;
}

// ─────────────────────────────────────────────────────────
// Validation Rules
// ─────────────────────────────────────────────────────────

/**
 * Validates payment amount against invoice balance
 */
export function validatePaymentAmount(
  paymentAmount: number,
  remainingBalance: number,
  allowOverpayment = false
): { valid: boolean; error?: string } {
  if (paymentAmount <= 0) {
    return { valid: false, error: "Payment amount must be positive" };
  }

  if (!allowOverpayment && paymentAmount > remainingBalance) {
    return {
      valid: false,
      error: `Payment amount (${paymentAmount}) exceeds remaining balance (${remainingBalance})`,
    };
  }

  return { valid: true };
}

/**
 * Validates refund amount against payment
 */
export function validateRefundAmount(
  refundAmount: number,
  paymentAmount: number,
  totalRefunded: number
): { valid: boolean; error?: string } {
  if (refundAmount <= 0) {
    return { valid: false, error: "Refund amount must be positive" };
  }

  const availableForRefund = calculateAvailableForRefund(
    paymentAmount,
    totalRefunded
  );

  if (refundAmount > availableForRefund) {
    return {
      valid: false,
      error: `Refund amount (${refundAmount}) exceeds available amount (${availableForRefund})`,
    };
  }

  return { valid: true };
}

/**
 * Validates cash payment details
 */
export function validateCashPayment(
  amountReceived: number,
  paymentAmount: number
): { valid: boolean; error?: string } {
  if (amountReceived < paymentAmount) {
    return {
      valid: false,
      error: `Amount received (${amountReceived}) is less than payment amount (${paymentAmount})`,
    };
  }

  return { valid: true };
}

/**
 * Validates invoice financial invariants
 */
export function validateInvoiceInvariants(invoice: {
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
}): { valid: boolean; error?: string } {
  // Check that remaining = total - paid
  const expectedRemaining = calculateRemainingAmount(
    invoice.totalAmount,
    invoice.paidAmount
  );

  if (Math.abs(invoice.remainingAmount - expectedRemaining) > 0.01) {
    return {
      valid: false,
      error: `Invoice balance mismatch: remaining (${invoice.remainingAmount}) !== total (${invoice.totalAmount}) - paid (${invoice.paidAmount})`,
    };
  }

  // Check no negative amounts
  if (
    invoice.totalAmount < 0 ||
    invoice.paidAmount < 0 ||
    invoice.remainingAmount < 0
  ) {
    return {
      valid: false,
      error: "Invoice amounts cannot be negative",
    };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────
// Payment Allocation Logic
// ─────────────────────────────────────────────────────────

/**
 * Allocates payment amount to invoice
 * Returns the updated invoice amounts
 */
export function allocatePaymentToInvoice(
  invoice: {
    totalAmount: number;
    paidAmount: number;
  },
  allocationAmount: number
): {
  newPaidAmount: number;
  newRemainingAmount: number;
  newStatus: InvoiceStatus;
} {
  const newPaidAmount = roundFinancial(invoice.paidAmount + allocationAmount);
  const newRemainingAmount = calculateRemainingAmount(
    invoice.totalAmount,
    newPaidAmount
  );
  const newStatus = determineInvoiceStatus(
    invoice.totalAmount,
    newPaidAmount,
    InvoiceStatus.ISSUED // Assuming invoice is at least issued
  );

  return {
    newPaidAmount,
    newRemainingAmount,
    newStatus,
  };
}

/**
 * Reverses payment allocation from invoice (for refunds)
 */
export function reversePaymentAllocation(
  invoice: {
    totalAmount: number;
    paidAmount: number;
  },
  allocationAmount: number
): {
  newPaidAmount: number;
  newRemainingAmount: number;
  newStatus: InvoiceStatus;
} {
  const newPaidAmount = roundFinancial(
    Math.max(0, invoice.paidAmount - allocationAmount)
  );
  const newRemainingAmount = calculateRemainingAmount(
    invoice.totalAmount,
    newPaidAmount
  );
  const newStatus = determineInvoiceStatus(
    invoice.totalAmount,
    newPaidAmount,
    InvoiceStatus.ISSUED
  );

  return {
    newPaidAmount,
    newRemainingAmount,
    newStatus,
  };
}

// ─────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────

/**
 * Converts Decimal to number for financial calculations
 */
export function decimalToNumber(value: Decimal | number): number {
  if (typeof value === "number") {
    return value;
  }
  return Number(value.toString());
}

/**
 * Checks if two financial amounts are equal (within tolerance)
 */
export function financialEquals(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) < tolerance;
}

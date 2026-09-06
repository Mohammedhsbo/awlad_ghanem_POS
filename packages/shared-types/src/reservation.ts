import { z } from "zod";
import { reservationStatusSchema, ReservationStatus } from "./enums.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default reservation duration in days */
export const DEFAULT_RESERVATION_DAYS = 7;

/** Maximum allowed reservation extension in days from today */
export const MAX_RESERVATION_DAYS = 90;

/** Minimum deposit percentage (10%) */
export const MIN_DEPOSIT_PERCENT = 0.1;

/** Hard minimum deposit amount (EGP) */
export const MIN_DEPOSIT_AMOUNT_EGP = 1000;

// ---------------------------------------------------------------------------
// Zod Schemas — core entity
// ---------------------------------------------------------------------------

export const reservationSchema = z.object({
  id: z.string().uuid(),
  reservationNumber: z.string().max(30),
  customerId: z.string().uuid(),
  motorcycleId: z.string().uuid(),
  branchId: z.string().uuid(),
  userId: z.string().uuid(),
  status: reservationStatusSchema,
  totalPrice: z.number().min(0),
  paidAmount: z.number().min(0),
  remainingAmount: z.number().min(0),
  address: z.string().max(1000).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  convertedOrderId: z.string().uuid().optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Reservation = z.infer<typeof reservationSchema>;

// ---------------------------------------------------------------------------
// Zod Schemas — DTOs
// ---------------------------------------------------------------------------

export const createReservationSchema = z.object({
  customerId: z.string().uuid("Invalid customer ID"),
  motorcycleId: z.string().uuid("Invalid motorcycle ID"),
  branchId: z.string().uuid("Invalid branch ID").optional(),
  paidAmount: z
    .number({ required_error: "Deposit amount is required" })
    .positive("Deposit must be greater than 0")
    .multipleOf(0.01, "Amount cannot have more than 2 decimal places"),
  paymentReference: z.string().max(200).optional(),
  address: z.string().max(1000, "Address is too long").optional(), // Delivery/billing address snapshot
  expirationDays: z.number().int().min(1).max(90).optional(),
  notes: z.string().max(2000).optional(),
});

export type CreateReservationRequest = z.infer<typeof createReservationSchema>;

export const updateReservationSchema = z
  .object({
    expiresAt: z.coerce.date().optional(),
    address: z.string().max(1000, "Address is too long").optional(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .strict();

export type UpdateReservationRequest = z.infer<typeof updateReservationSchema>;

export const cancelReservationSchema = z.object({
  reason: z.string().max(1000).optional(),
  requestRefund: z.boolean().optional().default(false),
});

export type CancelReservationRequest = z.infer<typeof cancelReservationSchema>;

export const convertReservationSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export type ConvertReservationRequest = z.infer<typeof convertReservationSchema>;

export const extendReservationSchema = z.object({
  expiresAt: z.coerce.date({ required_error: "New expiration date is required" }),
  reason: z.string().max(1000).optional(),
});

export type ExtendReservationRequest = z.infer<typeof extendReservationSchema>;

// ---------------------------------------------------------------------------
// Deposit Validation Utility
// ---------------------------------------------------------------------------

/**
 * Validates that a deposit amount satisfies business rules.
 *
 * Rules:
 * - Must be > 0
 * - Must be >= minimum (max of 10% of totalPrice or MIN_DEPOSIT_AMOUNT_EGP)
 * - Cannot exceed totalPrice
 *
 * @returns null if valid, or an error code string if invalid
 */
export function validateDepositAmount(
  paidAmount: number,
  totalPrice: number,
): "INVALID_DEPOSIT_AMOUNT" | null {
  if (paidAmount <= 0) return "INVALID_DEPOSIT_AMOUNT";
  if (paidAmount > totalPrice) return "INVALID_DEPOSIT_AMOUNT";

  const minByPercent = totalPrice * MIN_DEPOSIT_PERCENT;
  const minimumDeposit = Math.min(
    Math.max(minByPercent, MIN_DEPOSIT_AMOUNT_EGP),
    totalPrice, // deposit can equal totalPrice (full payment)
  );

  if (paidAmount < minimumDeposit) return "INVALID_DEPOSIT_AMOUNT";

  return null;
}

// ---------------------------------------------------------------------------
// Remaining Amount Calculation Utility
// ---------------------------------------------------------------------------

/**
 * Calculates the remaining amount owed on a reservation.
 * Always returns a value >= 0, rounded to 2 decimal places.
 */
export function calculateRemainingAmount(
  totalPrice: number,
  paidAmount: number,
): number {
  const remaining = totalPrice - paidAmount;
  return Math.max(0, Math.round(remaining * 100) / 100);
}

// ---------------------------------------------------------------------------
// Status Transition Validation Utility
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  [ReservationStatus.ACTIVE]: [
    ReservationStatus.CONVERTED,
    ReservationStatus.EXPIRED,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.EXPIRED]: [ReservationStatus.CANCELLED],
  [ReservationStatus.CONVERTED]: [],
  [ReservationStatus.CANCELLED]: [],
};

/**
 * Validates whether a reservation status transition is allowed.
 *
 * @returns null if valid, or an error code string if the transition is not permitted
 */
export function validateStatusTransition(
  from: ReservationStatus,
  to: ReservationStatus,
): "RESERVATION_NOT_ACTIVE" | "RESERVATION_ALREADY_CONVERTED" | "INVALID_STATUS_TRANSITION" | null {
  const allowed = VALID_TRANSITIONS[from];

  if (!allowed.includes(to)) {
    if (from === ReservationStatus.CONVERTED) return "RESERVATION_ALREADY_CONVERTED";
    if (from !== ReservationStatus.ACTIVE) return "RESERVATION_NOT_ACTIVE";
    return "INVALID_STATUS_TRANSITION";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Expiration Check Utility
// ---------------------------------------------------------------------------

/**
 * Returns true if the reservation is past its expiration date.
 */
export function isReservationExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date() > expiresAt;
}

/**
 * Calculates the number of days until a reservation expires.
 * Returns null if no expiration date is set.
 * Returns negative values for already-expired reservations.
 */
export function daysUntilExpiry(expiresAt: Date | null | undefined): number | null {
  if (!expiresAt) return null;
  const diffMs = expiresAt.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

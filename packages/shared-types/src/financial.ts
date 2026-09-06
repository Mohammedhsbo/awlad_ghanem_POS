import { z } from "zod";

// ─────────────────────────────────────────────────────────
// Financial Status Enums
// ─────────────────────────────────────────────────────────

export enum InvoiceStatus {
  DRAFT = "draft",
  ISSUED = "issued",
  PARTIALLY_PAID = "partially_paid",
  PAID = "paid",
  OVERPAID = "overpaid",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
}

export const invoiceStatusSchema = z.nativeEnum(InvoiceStatus);

export enum PaymentStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
  PARTIALLY_REFUNDED = "partially_refunded",
}

export const paymentStatusSchema = z.nativeEnum(PaymentStatus);

export enum PaymentMethod {
  CASH = "cash",
  CARD = "card",
  BANK_TRANSFER = "bank_transfer",
  CHEQUE = "cheque",
}

export const paymentMethodSchema = z.nativeEnum(PaymentMethod);

export enum RefundStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export const refundStatusSchema = z.nativeEnum(RefundStatus);

export enum FinancingContractStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  DEFAULTED = "defaulted",
  CANCELLED = "cancelled",
}

export const financingContractStatusSchema = z.nativeEnum(FinancingContractStatus);

export enum InstallmentStatus {
  UPCOMING = "upcoming",
  DUE = "due",
  PAID = "paid",
  OVERDUE = "overdue",
}

export const installmentStatusSchema = z.nativeEnum(InstallmentStatus);

export enum InstallmentFrequency {
  MONTHLY = "monthly",
  QUARTERLY = "quarterly",
}

export const installmentFrequencySchema = z.nativeEnum(InstallmentFrequency);

// ─────────────────────────────────────────────────────────
// Invoice Types
// ─────────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  orderId?: string | null;
  reservationId?: string | null;
  branchId: string;
  userId: string;
  status: InvoiceStatus;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  address?: string | null;
  issueDate?: Date | null;
  dueDate?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const invoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().max(50),
  customerId: z.string().uuid(),
  orderId: z.string().uuid().optional().nullable(),
  reservationId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid(),
  userId: z.string().uuid(),
  status: invoiceStatusSchema,
  totalAmount: z.number().min(0),
  paidAmount: z.number().min(0),
  remainingAmount: z.number().min(0),
  address: z.string().max(1000).optional().nullable(),
  issueDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─────────────────────────────────────────────────────────
// Invoice Item Types
// ─────────────────────────────────────────────────────────

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  motorcycleId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
  createdAt: Date;
}

export const invoiceItemSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  motorcycleId: z.string().uuid(),
  description: z.string().min(1).max(2000),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).default(0),
  totalPrice: z.number().min(0),
  createdAt: z.coerce.date(),
});

// ─────────────────────────────────────────────────────────
// Payment Types
// ─────────────────────────────────────────────────────────

export interface CashDetails {
  amountReceived: number;
  change: number;
}

export const cashDetailsSchema = z.object({
  amountReceived: z.number().positive("Amount received must be positive"),
  change: z.number().min(0, "Change cannot be negative"),
});

export interface Payment {
  id: string;
  paymentReference: string;
  invoiceId: string;
  customerId: string;
  branchId: string;
  userId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference?: string | null;
  externalTransactionId?: string | null;
  providerId?: string | null;
  idempotencyKey: string;
  cashAmountReceived?: number | null;
  cashChange?: number | null;
  confirmedAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const paymentSchema = z.object({
  id: z.string().uuid(),
  paymentReference: z.string().max(50),
  invoiceId: z.string().uuid(),
  customerId: z.string().uuid(),
  branchId: z.string().uuid(),
  userId: z.string().uuid(),
  amount: z.number().positive("Payment amount must be positive"),
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  reference: z.string().max(200).optional().nullable(),
  externalTransactionId: z.string().max(200).optional().nullable(),
  providerId: z.string().max(100).optional().nullable(),
  idempotencyKey: z.string().max(200),
  cashAmountReceived: z.number().min(0).optional().nullable(),
  cashChange: z.number().min(0).optional().nullable(),
  confirmedAt: z.coerce.date().optional().nullable(),
  failedAt: z.coerce.date().optional().nullable(),
  failureReason: z.string().max(1000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─────────────────────────────────────────────────────────
// Payment Allocation Types
// ─────────────────────────────────────────────────────────

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  createdAt: Date;
}

export const paymentAllocationSchema = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amount: z.number().positive("Allocation amount must be positive"),
  createdAt: z.coerce.date(),
});

// ─────────────────────────────────────────────────────────
// Refund Types
// ─────────────────────────────────────────────────────────

export interface Refund {
  id: string;
  refundReference: string;
  paymentId: string;
  amount: number;
  reason: string;
  method: PaymentMethod;
  status: string;
  processedBy: string;
  processedAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const refundSchema = z.object({
  id: z.string().uuid(),
  refundReference: z.string().max(50),
  paymentId: z.string().uuid(),
  amount: z.number().positive("Refund amount must be positive"),
  reason: z.string().min(1).max(2000),
  method: paymentMethodSchema,
  status: z.string().max(20),
  processedBy: z.string().uuid(),
  processedAt: z.coerce.date().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─────────────────────────────────────────────────────────
// Invoice DTOs
// ─────────────────────────────────────────────────────────

export const createInvoiceSchema = z.object({
  customerId: z.string().uuid("Invalid customer ID"),
  orderId: z.string().uuid().optional(),
  reservationId: z.string().uuid().optional(),
  branchId: z.string().uuid("Invalid branch ID").optional(),
  address: z.string().max(1000).optional(),
  totalAmount: z.number().positive("Total amount must be positive"),
  items: z
    .array(
      z.object({
        motorcycleId: z.string().uuid("Invalid motorcycle ID"),
        description: z.string().min(1).max(2000),
        quantity: z.number().int().min(1),
        unitPrice: z.number().min(0),
        discount: z.number().min(0).default(0),
      })
    )
    .min(1, "Invoice must have at least one item"),
  dueDate: z.coerce.date().optional(),
  notes: z.string().max(5000).optional(),
});

export type CreateInvoiceRequest = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceSchema = z
  .object({
    notes: z.string().max(5000).optional().nullable(),
    dueDate: z.coerce.date().optional().nullable(),
  })
  .strict();

export type UpdateInvoiceRequest = z.infer<typeof updateInvoiceSchema>;

// ─────────────────────────────────────────────────────────
// Payment DTOs
// ─────────────────────────────────────────────────────────

export const createPaymentSchema = z.object({
  idempotencyKey: z.string().min(1, "Idempotency key is required"),
  invoiceId: z.string().uuid("Invalid invoice ID"),
  amount: z
    .number({ required_error: "Payment amount is required" })
    .positive("Payment amount must be positive")
    .multipleOf(0.01, "Amount cannot have more than 2 decimal places"),
  method: paymentMethodSchema,
  reference: z.string().max(200).optional(),
  externalTransactionId: z.string().max(200).optional(),
  providerId: z.string().max(100).optional(),
  cashDetails: cashDetailsSchema.optional(),
  notes: z.string().max(5000).optional(),
});

export type CreatePaymentRequest = z.infer<typeof createPaymentSchema>;

export const confirmPaymentSchema = z.object({
  externalTransactionId: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});

export type ConfirmPaymentRequest = z.infer<typeof confirmPaymentSchema>;

export const cancelPaymentSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export type CancelPaymentRequest = z.infer<typeof cancelPaymentSchema>;

// ─────────────────────────────────────────────────────────
// Refund DTOs
// ─────────────────────────────────────────────────────────

export const createRefundSchema = z.object({
  paymentId: z.string().uuid("Invalid payment ID"),
  amount: z
    .number({ required_error: "Refund amount is required" })
    .positive("Refund amount must be positive")
    .multipleOf(0.01, "Amount cannot have more than 2 decimal places"),
  reason: z.string().min(1, "Refund reason is required").max(2000),
  method: paymentMethodSchema,
  notes: z.string().max(5000).optional(),
});

export type CreateRefundRequest = z.infer<typeof createRefundSchema>;

// ─────────────────────────────────────────────────────────
// Financial Constants
// ─────────────────────────────────────────────────────────

/** Maximum refund amount as percentage of payment (100%) */
export const MAX_REFUND_PERCENT = 1.0;

/** Idempotency key retention period in hours */
export const IDEMPOTENCY_KEY_RETENTION_HOURS = 24;

/** Financial amount precision (2 decimal places) */
export const FINANCIAL_PRECISION = 2;

/** Maximum decimal places for financial calculations */
export const MAX_DECIMAL_PLACES = 2;

// ─────────────────────────────────────────────────────────
// Financing Contract Types
// ─────────────────────────────────────────────────────────

export interface FinancingContract {
  id: string;
  contractNumber: string;
  customerId: string;
  orderId: string;
  branchId: string;
  createdBy: string;
  approvedBy?: string | null;
  totalAmount: number;
  downPayment: number;
  financingAmount: number;
  numberOfInstallments: number;
  installmentFrequency: InstallmentFrequency;
  interestRate: number;
  startDate: Date;
  status: FinancingContractStatus;
  approvedAt?: Date | null;
  completedAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const financingContractSchema = z.object({
  id: z.string().uuid(),
  contractNumber: z.string().max(50),
  customerId: z.string().uuid(),
  orderId: z.string().uuid(),
  branchId: z.string().uuid(),
  createdBy: z.string().uuid(),
  approvedBy: z.string().uuid().optional().nullable(),
  totalAmount: z.number().positive("Total amount must be positive"),
  downPayment: z.number().min(0, "Down payment cannot be negative"),
  financingAmount: z.number().positive("Financing amount must be positive"),
  numberOfInstallments: z.number().int().min(1, "Must have at least one installment"),
  installmentFrequency: installmentFrequencySchema,
  interestRate: z.number().min(0).max(100, "Interest rate must be between 0 and 100"),
  startDate: z.coerce.date(),
  status: financingContractStatusSchema,
  approvedAt: z.coerce.date().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─────────────────────────────────────────────────────────
// Installment Types
// ─────────────────────────────────────────────────────────

export interface Installment {
  id: string;
  contractId: string;
  installmentNumber: number;
  dueDate: Date;
  amount: number;
  paidAmount: number;
  status: InstallmentStatus;
  paidAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const installmentSchema = z.object({
  id: z.string().uuid(),
  contractId: z.string().uuid(),
  installmentNumber: z.number().int().min(1),
  dueDate: z.coerce.date(),
  amount: z.number().positive("Installment amount must be positive"),
  paidAmount: z.number().min(0, "Paid amount cannot be negative"),
  status: installmentStatusSchema,
  paidAt: z.coerce.date().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─────────────────────────────────────────────────────────
// Financing DTOs
// ─────────────────────────────────────────────────────────

export const createFinancingContractSchema = z
  .object({
    orderId: z.string().uuid("Invalid order ID"),
    customerId: z.string().uuid("Invalid customer ID"),
    branchId: z.string().uuid("Invalid branch ID").optional(),
    totalAmount: z
      .number({ required_error: "Total amount is required" })
      .positive("Total amount must be positive")
      .multipleOf(0.01, "Amount cannot have more than 2 decimal places"),
    downPayment: z
      .number()
      .min(0, "Down payment cannot be negative")
      .multipleOf(0.01, "Amount cannot have more than 2 decimal places")
      .default(0),
    numberOfInstallments: z
      .number({ required_error: "Number of installments is required" })
      .int("Number of installments must be an integer")
      .min(1, "Must have at least one installment")
      .max(120, "Maximum 120 installments allowed"),
    installmentFrequency: installmentFrequencySchema.default(InstallmentFrequency.MONTHLY),
    interestRate: z
      .number()
      .min(0, "Interest rate cannot be negative")
      .max(100, "Interest rate cannot exceed 100%")
      .multipleOf(0.01, "Interest rate cannot have more than 2 decimal places")
      .default(0),
    startDate: z.coerce.date(),
    notes: z.string().max(5000).optional(),
  })
  .refine((data) => data.downPayment < data.totalAmount, {
    message: "Down payment must be less than total amount",
    path: ["downPayment"],
  })
  .refine((data) => data.downPayment >= 0, {
    message: "Down payment cannot be negative",
    path: ["downPayment"],
  });

export type CreateFinancingContractRequest = z.infer<typeof createFinancingContractSchema>;

export const updateFinancingContractSchema = z
  .object({
    notes: z.string().max(5000).optional().nullable(),
    status: financingContractStatusSchema.optional(),
  })
  .strict();

export type UpdateFinancingContractRequest = z.infer<typeof updateFinancingContractSchema>;

export const approveFinancingContractSchema = z.object({
  notes: z.string().max(5000).optional(),
});

export type ApproveFinancingContractRequest = z.infer<typeof approveFinancingContractSchema>;

// ─────────────────────────────────────────────────────────
// Installment Calculation Types
// ─────────────────────────────────────────────────────────

export interface InstallmentScheduleItem {
  installmentNumber: number;
  dueDate: Date;
  amount: number;
}

export interface InstallmentCalculationResult {
  financingAmount: number;
  installments: InstallmentScheduleItem[];
  totalInstallmentAmount: number;
}

// ─────────────────────────────────────────────────────────
// Financing Constants
// ─────────────────────────────────────────────────────────

/** Maximum number of installments allowed */
export const MAX_INSTALLMENTS = 120;

/** Minimum financing amount */
export const MIN_FINANCING_AMOUNT = 100;

/** Days in a month for monthly frequency (approximation) */
export const DAYS_PER_MONTH = 30;

/** Months in a quarter */
export const MONTHS_PER_QUARTER = 3;


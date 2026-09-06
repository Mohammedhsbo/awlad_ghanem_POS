import { z } from "zod";

// ─────────────────────────────────────────────────────────
// POS Transaction Types
// ─────────────────────────────────────────────────────────
export enum POSTransactionType {
  ORDER = "order",
  RESERVATION = "reservation",
}

export const posTransactionTypeSchema = z.nativeEnum(POSTransactionType);

// ─────────────────────────────────────────────────────────
// POS Dashboard Types
// ─────────────────────────────────────────────────────────
export interface POSDashboardData {
  currentUser: {
    id: string;
    name: string;
    role: string;
    branch: {
      id: string;
      nameAr: string;
      nameEn: string;
    } | null;
    permissions: {
      canApplyDiscount: boolean;
      maxDiscountPercent: number;
      maxDiscountAmount: number;
      canCreateCustomer: boolean;
      canSwitchBranch: boolean;
    };
  };
  todayStats: {
    ordersCreated: number;
    reservationsCreated: number;
    totalSales: number;
    availableMotorcycles: number;
  };
  recentTransactions: Array<{
    id: string;
    type: "order" | "reservation";
    number: string;
    customerName: string;
    motorcycleModel: string;
    amount: number;
    createdAt: string;
  }>;
}

// ─────────────────────────────────────────────────────────
// POS Customer Search Result
// ─────────────────────────────────────────────────────────
export interface POSCustomerSearchResult {
  id: string;
  name: string;
  phone: string;
  email?: string;
  recentOrderCount: number;
  activeReservationCount: number;
  lastTransactionDate?: string;
  defaultAddress?: {
    addressLine: string;
    city?: string;
  };
}

export interface POSCustomerSearchResponse {
  items: POSCustomerSearchResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const posCustomerSearchSchema = z.object({
  q: z.string().trim().refine((value) => value.length === 0 || value.length >= 2, {
    message: "Search term must be at least 2 characters",
  }).optional().default(""),
  limit: z.coerce.number().min(1).max(20).default(10),
  page: z.coerce.number().int().min(1).default(1),
});

export type POSCustomerSearchQuery = z.infer<typeof posCustomerSearchSchema>;

// ─────────────────────────────────────────────────────────
// POS Motorcycle Search Result
// ─────────────────────────────────────────────────────────
export interface POSMotorcycleSearchResult {
  id: string;
  vin: string;
  model: string;
  year: number;
  color?: string;
  brand: {
    nameAr: string;
    nameEn: string;
    logo?: string;
  };
  category: {
    nameAr: string;
    nameEn: string;
  };
  price: number;
  status: string;
  images: string[];
}

export const posMotorcycleSearchSchema = z.object({
  q: z.string().min(2, "Search term must be at least 2 characters").optional(),
  branchId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export type POSMotorcycleSearchQuery = z.infer<typeof posMotorcycleSearchSchema>;

// ─────────────────────────────────────────────────────────
// Discount Authorization
// ─────────────────────────────────────────────────────────
export interface DiscountLimits {
  cashier: {
    maxPercent: number;
    maxAmount: number;
  };
  branch_manager: {
    maxPercent: number;
    maxAmount: number;
  };
  super_admin: {
    maxPercent: number;
    maxAmount: number;
  };
}

export const DISCOUNT_LIMITS: DiscountLimits = {
  cashier: {
    maxPercent: 5,
    maxAmount: 2000,
  },
  branch_manager: {
    maxPercent: 15,
    maxAmount: 10000,
  },
  super_admin: {
    maxPercent: 100,
    maxAmount: Number.MAX_SAFE_INTEGER,
  },
};

export function getDiscountLimits(role: string): {
  maxPercent: number;
  maxAmount: number;
} {
  const normalizedRole = role.toLowerCase();
  if (normalizedRole === "super_admin") {
    return DISCOUNT_LIMITS.super_admin;
  }
  if (normalizedRole === "branch_manager" || normalizedRole.includes("manager")) {
    return DISCOUNT_LIMITS.branch_manager;
  }
  // Default to cashier limits
  return DISCOUNT_LIMITS.cashier;
}

export function canApplyDiscount(
  discountAmount: number,
  totalAmount: number,
  role: string
): { authorized: boolean; reason?: string } {
  const limits = getDiscountLimits(role);
  const discountPercent = (discountAmount / totalAmount) * 100;

  if (discountAmount > limits.maxAmount) {
    return {
      authorized: false,
      reason: `Discount amount exceeds limit for ${role} (${limits.maxAmount} EGP)`,
    };
  }

  if (discountPercent > limits.maxPercent) {
    return {
      authorized: false,
      reason: `Discount percentage exceeds limit for ${role} (${limits.maxPercent}%)`,
    };
  }

  return { authorized: true };
}

// ─────────────────────────────────────────────────────────
// Idempotency Key Generation
// ─────────────────────────────────────────────────────────
export function generateIdempotencyKey(
  userId: string,
  data: {
    customerId: string;
    motorcycleId: string;
    timestamp?: number;
  }
): string {
  const ts = data.timestamp || Date.now();
  return `pos-${userId}-${data.customerId}-${data.motorcycleId}-${ts}`;
}

export const idempotencyKeySchema = z
  .string()
  .min(10, "Idempotency key too short")
  .regex(/^pos-/, "Invalid idempotency key format");

// ─────────────────────────────────────────────────────────
// POS Transaction DTOs
// ─────────────────────────────────────────────────────────
export const validatePOSTransactionSchema = z.object({
  customerId: z.string().uuid(),
  motorcycleId: z.string().uuid(),
  type: posTransactionTypeSchema,
  discount: z.number().min(0).optional(),
  depositAmount: z.number().min(0).optional(),
});

export type ValidatePOSTransactionDto = z.infer<typeof validatePOSTransactionSchema>;

export interface ValidatePOSTransactionResponse {
  valid: boolean;
  customer: {
    id: string;
    name: string;
    isActive: boolean;
  };
  motorcycle: {
    id: string;
    vin: string;
    model: string;
    price: number;
    status: string;
    isAvailable: boolean;
  };
  calculations: {
    totalAmount: number;
    discountAmount: number;
    netAmount: number;
    depositAmount?: number;
    remainingAmount?: number;
  };
  discountAuthorization: {
    authorized: boolean;
    reason?: string;
  };
  warnings: string[];
}

export const createPOSTransactionSchema = z.object({
  type: posTransactionTypeSchema,
  customerId: z.string().uuid(),
  motorcycleId: z.string().uuid(),
  discount: z
    .object({
      amount: z.number().min(0),
      reason: z.string().optional(),
    })
    .optional(),
  reservationData: z
    .object({
      depositAmount: z.number().min(0),
      expirationDays: z.number().min(1).max(90).optional(),
    })
    .optional(),
  address: z.string().max(1000).optional(),
  idempotencyKey: idempotencyKeySchema,
  notes: z.string().max(1000).optional(),
});

export type CreatePOSTransactionDto = z.infer<typeof createPOSTransactionSchema>;

export interface CreatePOSTransactionResponse {
  id: string;
  type: "order" | "reservation";
  number: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  motorcycle: {
    id: string;
    vin: string;
    model: string;
    brand: {
      nameAr: string;
      nameEn: string;
    };
  };
  totalAmount: number;
  discount: number;
  netAmount: number;
  depositAmount?: number;
  remainingAmount?: number;
  expiresAt?: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────
// POS Active Reservations
// ─────────────────────────────────────────────────────────
export const posActiveReservationsQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  expiringInDays: z.coerce.number().min(0).max(30).optional(),
});

export type POSActiveReservationsQuery = z.infer<typeof posActiveReservationsQuerySchema>;

export interface POSActiveReservation {
  id: string;
  reservationNumber: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  motorcycle: {
    id: string;
    vin: string;
    model: string;
    brand: string;
  };
  depositAmount: number;
  totalAmount: number;
  remainingAmount: number;
  expiresAt: string;
  expiresInDays: number;
  isExpiringSoon: boolean;
  createdAt: string;
}

export const convertPOSReservationSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export type ConvertPOSReservationDto = z.infer<typeof convertPOSReservationSchema>;

// ─────────────────────────────────────────────────────────
// POS Offline Support
// ─────────────────────────────────────────────────────────
export enum OfflineOperationType {
  CUSTOMER_CREATE = "customer_create",
  CUSTOMER_UPDATE = "customer_update",
}

export const offlineOperationTypeSchema = z.nativeEnum(OfflineOperationType);

export interface OfflineOperation {
  id: string;
  type: OfflineOperationType;
  data: any;
  timestamp: string;
  userId: string;
  branchId: string;
}

export const queueOfflineOperationSchema = z.object({
  type: offlineOperationTypeSchema,
  data: z.any(),
  localTimestamp: z.string(),
});

export type QueueOfflineOperationDto = z.infer<typeof queueOfflineOperationSchema>;

export interface OfflineSyncStatus {
  isOnline: boolean;
  lastSyncAt?: string;
  queuedOperations: number;
  syncInProgress: boolean;
  conflicts: Array<{
    operationId: string;
    type: string;
    reason: string;
    resolution: string;
  }>;
}

export interface QueuedOperation {
  id: string;
  type: OfflineOperationType;
  data: any;
  status: "pending" | "synced" | "failed";
  createdAt: string;
  expiresAt: string;
}

// ─────────────────────────────────────────────────────────
// POS Error Codes
// ─────────────────────────────────────────────────────────
export enum POSErrorCode {
  MOTORCYCLE_NOT_AVAILABLE = "MOTORCYCLE_NOT_AVAILABLE",
  IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT",
  DISCOUNT_UNAUTHORIZED = "DISCOUNT_UNAUTHORIZED",
  CUSTOMER_INACTIVE = "CUSTOMER_INACTIVE",
  INVALID_DEPOSIT_AMOUNT = "INVALID_DEPOSIT_AMOUNT",
  RESERVATION_NOT_ACTIVE = "RESERVATION_NOT_ACTIVE",
  BRANCH_SCOPE_VIOLATION = "BRANCH_SCOPE_VIOLATION",
  TRANSACTION_TIMEOUT = "TRANSACTION_TIMEOUT",
  QUEUE_LIMIT_EXCEEDED = "QUEUE_LIMIT_EXCEEDED",
  OPERATION_TOO_LARGE = "OPERATION_TOO_LARGE",
  OPERATION_EXPIRED = "OPERATION_EXPIRED",
  INVALID_OFFLINE_OPERATION = "INVALID_OFFLINE_OPERATION",
}

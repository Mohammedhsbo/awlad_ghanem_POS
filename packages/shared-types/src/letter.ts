import { z } from "zod";

// ─────────────────────────────────────────────────────────
// Letter Status & Type Enums
// ─────────────────────────────────────────────────────────

export enum LetterStatus {
  ISSUED = "issued",
  RECEIVED = "received",
  NOT_RECEIVED = "not_received",
}

export const letterStatusSchema = z.nativeEnum(LetterStatus);

export enum LetterType {
  RECEIPT = "receipt",
  DELIVERY = "delivery",
}

export const letterTypeSchema = z.nativeEnum(LetterType);

export enum LetterAction {
  CREATED = "created",
  ISSUED = "issued",
  CONFIRMED = "confirmed",
  NOT_RECEIVED_RECORDED = "not_received_recorded",
  CANCELLED = "cancelled",
  DOCUMENT_GENERATED = "document_generated",
}

export const letterActionSchema = z.nativeEnum(LetterAction);

// ─────────────────────────────────────────────────────────
// Letter Types
// ─────────────────────────────────────────────────────────

export interface Letter {
  id: string;
  letterNumber: string;
  customerId: string;
  motorcycleId: string;
  orderId?: string | null;
  reservationId?: string | null;
  branchId: string;
  type: LetterType;
  status: LetterStatus;
  issuedAt: Date;
  confirmedAt?: Date | null;
  expectedDeliveryDate?: Date | null;
  documentStorageRef?: string | null;
  userId: string;
  confirmedBy?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const letterSchema = z.object({
  id: z.string().uuid(),
  letterNumber: z.string().max(30),
  customerId: z.string().uuid(),
  motorcycleId: z.string().uuid(),
  orderId: z.string().uuid().optional().nullable(),
  reservationId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid(),
  type: letterTypeSchema,
  status: letterStatusSchema,
  issuedAt: z.date(),
  confirmedAt: z.date().optional().nullable(),
  expectedDeliveryDate: z.date().optional().nullable(),
  documentStorageRef: z.string().max(255).optional().nullable(),
  userId: z.string().uuid(),
  confirmedBy: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// ─────────────────────────────────────────────────────────
// Letter Document Types
// ─────────────────────────────────────────────────────────

export interface LetterDocument {
  id: string;
  letterId: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageRef: string;
  version: number;
  createdBy: string;
  createdAt: Date;
}

export const letterDocumentSchema = z.object({
  id: z.string().uuid(),
  letterId: z.string().uuid(),
  documentType: z.string().min(1).max(50),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).max(100),
  storageRef: z.string().min(1).max(500),
  version: z.number().int().positive().default(1),
  createdBy: z.string().uuid(),
  createdAt: z.date(),
});

// ─────────────────────────────────────────────────────────
// Letter History Types
// ─────────────────────────────────────────────────────────

export interface LetterHistory {
  id: string;
  letterId: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorId: string;
  reason?: string | null;
  notes?: string | null;
  createdAt: Date;
}

export const letterHistorySchema = z.object({
  id: z.string().uuid(),
  letterId: z.string().uuid(),
  action: z.string().min(1).max(50),
  fromStatus: z.string().max(20).optional().nullable(),
  toStatus: z.string().max(20).optional().nullable(),
  actorId: z.string().uuid(),
  reason: z.string().max(500).optional().nullable(),
  notes: z.string().optional().nullable(),
  createdAt: z.date(),
});

// ─────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────

export const createLetterDtoSchema = z.object({
  customerId: z.string().uuid(),
  motorcycleId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  reservationId: z.string().uuid().optional(),
  type: letterTypeSchema.default(LetterType.RECEIPT),
  expectedDeliveryDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export type CreateLetterDto = z.infer<typeof createLetterDtoSchema>;

export const confirmReceiptDtoSchema = z.object({
  confirmedAt: z.string().datetime().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export type ConfirmReceiptDto = z.infer<typeof confirmReceiptDtoSchema>;

export const recordNonReceiptDtoSchema = z.object({
  reason: z.string().min(1).max(500),
  notes: z.string().optional(),
});

export type RecordNonReceiptDto = z.infer<typeof recordNonReceiptDtoSchema>;

export const generateDocumentDtoSchema = z.object({
  documentType: z.enum(["delivery", "receipt"]),
  regenerate: z.boolean().optional().default(false),
});

export type GenerateDocumentDto = z.infer<typeof generateDocumentDtoSchema>;

export const updateLetterDtoSchema = z.object({
  expectedDeliveryDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export type UpdateLetterDto = z.infer<typeof updateLetterDtoSchema>;

// ─────────────────────────────────────────────────────────
// Status Transition Validation
// ─────────────────────────────────────────────────────────

export const LETTER_STATUS_TRANSITIONS: Record<LetterStatus, LetterStatus[]> = {
  [LetterStatus.ISSUED]: [LetterStatus.RECEIVED, LetterStatus.NOT_RECEIVED],
  [LetterStatus.NOT_RECEIVED]: [LetterStatus.RECEIVED],
  [LetterStatus.RECEIVED]: [], // Terminal state
};

export function isValidLetterStatusTransition(
  fromStatus: LetterStatus,
  toStatus: LetterStatus
): boolean {
  const allowedTransitions = LETTER_STATUS_TRANSITIONS[fromStatus];
  return allowedTransitions.includes(toStatus);
}

export function validateLetterStatusTransition(
  fromStatus: LetterStatus,
  toStatus: LetterStatus
): void {
  if (!isValidLetterStatusTransition(fromStatus, toStatus)) {
    throw new Error(
      `Invalid status transition from ${fromStatus} to ${toStatus}. Allowed transitions: ${LETTER_STATUS_TRANSITIONS[fromStatus].join(", ")}`
    );
  }
}

// ─────────────────────────────────────────────────────────
// Extended Letter Response Types (with relations)
// ─────────────────────────────────────────────────────────

export interface LetterWithRelations extends Letter {
  customer?: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
  };
  motorcycle?: {
    id: string;
    vin: string;
    model: string;
    year: number;
    color?: string | null;
    brand?: {
      nameEn: string;
      nameAr: string;
    };
  };
  order?: {
    id: string;
    orderNumber: string;
    status: string;
  } | null;
  reservation?: {
    id: string;
    reservationNumber: string;
    status: string;
  } | null;
  branch?: {
    id: string;
    nameEn: string;
    nameAr: string;
  };
  creator?: {
    id: string;
    name: string;
  };
  confirmer?: {
    id: string;
    name: string;
  } | null;
  documents?: LetterDocument[];
  history?: LetterHistory[];
}

export interface LetterSummary {
  id: string;
  letterNumber: string;
  customerName: string;
  motorcycleVin: string;
  motorcycleModel: string;
  status: LetterStatus;
  type: LetterType;
  issuedAt: Date;
  confirmedAt?: Date | null;
  daysPending?: number | null;
}

// ─────────────────────────────────────────────────────────
// Query/Filter Types
// ─────────────────────────────────────────────────────────

export interface LetterQueryParams {
  customerId?: string;
  motorcycleId?: string;
  orderId?: string;
  reservationId?: string;
  status?: LetterStatus;
  type?: LetterType;
  branchId?: string;
  search?: string; // Search by customer name, phone, VIN, letter number
  pendingOnly?: boolean;
  issuedAfter?: Date;
  issuedBefore?: Date;
  startDate?: string; // Alias for issuedAfter
  endDate?: string; // Alias for issuedBefore
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}

export const letterQueryParamsSchema = z.object({
  customerId: z.string().uuid().optional(),
  motorcycleId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  reservationId: z.string().uuid().optional(),
  status: letterStatusSchema.optional(),
  type: letterTypeSchema.optional(),
  branchId: z.string().uuid().optional(),
  search: z.string().optional(),
  pendingOnly: z.boolean().optional(),
  issuedAfter: z.string().datetime().optional(),
  issuedBefore: z.string().datetime().optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

// ─────────────────────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────────────────────

export interface CreateLetterResponse {
  success: boolean;
  letter: LetterWithRelations;
  message: string;
}

export interface ListLettersResponse {
  letters: any[]; // Keep flexible for now
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LetterDetailResponse {
  letter: LetterWithRelations;
}

import { z } from "zod";

// ─────────────────────────────────────────────────────────
// Order Status Enum
// ─────────────────────────────────────────────────────────
export enum OrderStatus {
  DRAFT = "draft",
  CONFIRMED = "confirmed",
  PROCESSING = "processing",
  AWAITING_DELIVERY = "awaiting_delivery",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
}

export const orderStatusSchema = z.nativeEnum(OrderStatus);

// ─────────────────────────────────────────────────────────
// OrderItem Types
// ─────────────────────────────────────────────────────────
export interface OrderItem {
  id: string;
  orderId: string;
  motorcycleId: string;
  unitPrice: number; // Snapshot price at order time
  discount: number; // Per-item discount
}

export const orderItemSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  motorcycleId: z.string().uuid(),
  unitPrice: z.number().min(0, "Unit price must be positive"),
  discount: z.number().min(0, "Discount cannot be negative").default(0),
});

// OrderItem with motorcycle details (for responses)
export interface OrderItemWithMotorcycle extends OrderItem {
  motorcycle: {
    id: string;
    vin: string;
    model: string;
    year: number;
    color?: string | null;
    brand: {
      id: string;
      nameAr: string;
      nameEn: string;
    };
    currentStatus: string; // Current motorcycle status (may differ from order time)
  };
}

// ─────────────────────────────────────────────────────────
// Order Types
// ─────────────────────────────────────────────────────────
export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  branchId: string;
  userId: string;
  status: OrderStatus;
  totalAmount: number;
  discount: number;
  netAmount: number;
  address?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const orderSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string().max(30),
  customerId: z.string().uuid(),
  branchId: z.string().uuid(),
  userId: z.string().uuid(),
  status: orderStatusSchema,
  totalAmount: z.number().min(0),
  discount: z.number().min(0).default(0),
  netAmount: z.number().min(0),
  address: z.string().max(1000).optional().nullable(),
  notes: z.string().max(2000, "Notes are too long").optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Order with relations (for detail responses)
export interface OrderWithRelations extends Order {
  customer: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    defaultAddress?: {
      addressLine: string;
      city?: string | null;
    } | null;
  };
  branch: {
    id: string;
    nameAr: string;
    nameEn: string;
  };
  user: {
    id: string;
    name: string;
  };
  items: OrderItemWithMotorcycle[];
  statusHistory?: Array<{
    status: string;
    changedAt: string;
    changedBy: {
      id: string;
      name: string;
    };
    reason?: string;
  }>;
  payments?: {
    totalPaid: number;
    remainingBalance: number;
  };
}

// Order list item (for paginated lists)
export interface OrderListItem {
  id: string;
  orderNumber: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  branch: {
    id: string;
    nameAr: string;
    nameEn: string;
  };
  status: OrderStatus;
  itemCount: number;
  totalAmount: number;
  discount: number;
  netAmount: number;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────
// Create Order DTOs
// ─────────────────────────────────────────────────────────
export const createOrderSchema = z
  .object({
    customerId: z.string().uuid("Invalid customer ID"),
    branchId: z.string().uuid("Invalid branch ID").optional(),
    motorcycleIds: z
      .array(z.string().uuid("Invalid motorcycle ID"))
      .min(1, "At least one motorcycle is required")
      .max(50, "Cannot order more than 50 motorcycles at once"),
    discount: z
      .number()
      .min(0, "Discount cannot be negative")
      .default(0),
    address: z.string().max(1000, "Address is too long").optional(), // Delivery/billing address snapshot
    notes: z.string().max(2000, "Notes are too long").optional(),
    isDraft: z.boolean().default(false), // POS only
  })
  .strict();

export type CreateOrderDto = z.infer<typeof createOrderSchema>;

// ─────────────────────────────────────────────────────────
// Update Order DTOs
// ─────────────────────────────────────────────────────────
export const updateOrderSchema = z
  .object({
    customerId: z.string().uuid("Invalid customer ID").optional(),
    motorcycleIds: z
      .array(z.string().uuid("Invalid motorcycle ID"))
      .min(1, "At least one motorcycle is required")
      .max(50, "Cannot order more than 50 motorcycles at once")
      .optional(),
    discount: z.number().min(0, "Discount cannot be negative").optional(),
    address: z.string().max(1000, "Address is too long").optional(),
    notes: z.string().max(2000, "Notes are too long").optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type UpdateOrderDto = z.infer<typeof updateOrderSchema>;

// ─────────────────────────────────────────────────────────
// Order Status Transition DTOs
// ─────────────────────────────────────────────────────────
export const changeOrderStatusSchema = z
  .object({
    status: orderStatusSchema,
    reason: z.string().max(500, "Reason is too long").optional(),
  })
  .strict();

export type ChangeOrderStatusDto = z.infer<typeof changeOrderStatusSchema>;

// ─────────────────────────────────────────────────────────
// Cancel Order DTOs
// ─────────────────────────────────────────────────────────
export const cancelOrderSchema = z
  .object({
    reason: z.string().max(500, "Reason is too long").optional(),
  })
  .strict();

export type CancelOrderDto = z.infer<typeof cancelOrderSchema>;

// ─────────────────────────────────────────────────────────
// Order Query/Filter DTOs
// ─────────────────────────────────────────────────────────
export const listOrdersQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().optional(), // Order number, customer name, phone, VIN
    customerId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    status: orderStatusSchema.optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    sort: z.enum(["createdAt", "netAmount", "orderNumber"]).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

// ─────────────────────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────────────────────
export interface CreateOrderResponse {
  id: string;
  orderNumber: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  branch: {
    id: string;
    nameAr: string;
    nameEn: string;
  };
  user: {
    id: string;
    name: string;
  } | null;
  status: OrderStatus;
  items: Array<{
    id: string;
    motorcycle: {
      id: string;
      vin: string;
      model: string;
      brand: { nameAr: string; nameEn: string };
    };
    unitPrice: number;
    discount: number;
  }>;
  totalAmount: number;
  discount: number;
  netAmount: number;
  notes?: string | null;
  createdAt: string;
}

export interface OrderStatusChangeResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  previousStatus: OrderStatus;
  updatedAt: string;
}

export interface ConfirmOrderResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  netAmount: number;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────
// Order History Types
// ─────────────────────────────────────────────────────────
export interface OrderHistoryEntry {
  id: string;
  action: string; // "order:status_change", "order:created", etc.
  before?: {
    status?: OrderStatus;
  };
  after: {
    status: OrderStatus;
  };
  user: {
    id: string;
    name: string;
  };
  reason?: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────
// Order Validation Helpers
// ─────────────────────────────────────────────────────────
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.DRAFT]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [
    OrderStatus.AWAITING_DELIVERY,
    OrderStatus.COMPLETED,
    OrderStatus.REFUNDED,
  ],
  [OrderStatus.AWAITING_DELIVERY]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [], // Terminal state
  [OrderStatus.CANCELLED]: [], // Terminal state
  [OrderStatus.REFUNDED]: [], // Terminal state
};

export function isValidOrderStatusTransition(
  from: OrderStatus,
  to: OrderStatus
): boolean {
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getMotorcycleStatusForOrderStatus(
  orderStatus: OrderStatus
): "available" | "sold" | null {
  switch (orderStatus) {
    case OrderStatus.DRAFT:
      return null; // No change
    case OrderStatus.CONFIRMED:
    case OrderStatus.PROCESSING:
    case OrderStatus.AWAITING_DELIVERY:
    case OrderStatus.COMPLETED:
      return "sold";
    case OrderStatus.CANCELLED:
    case OrderStatus.REFUNDED:
      return "available";
    default:
      return null;
  }
}

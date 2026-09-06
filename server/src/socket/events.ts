/**
 * TASK-008-API: WebSocket event definitions.
 * These are the canonical event names emitted from the motorcycle service.
 */
export const MOTORCYCLE_EVENTS = {
  STATUS_CHANGED: 'motorcycle:status_changed',
  CREATED: 'motorcycle:created',
  DELETED: 'motorcycle:deleted',
} as const;

export type MotorcycleStatusChangedPayload = {
  motorcycleId: string;
  oldStatus: string;
  newStatus: string;
  branchId: string;
};

export type MotorcycleCreatedPayload = {
  motorcycleId: string;
  branchId: string;
  status: string;
};

export type MotorcycleDeletedPayload = {
  motorcycleId: string;
  branchId: string;
};

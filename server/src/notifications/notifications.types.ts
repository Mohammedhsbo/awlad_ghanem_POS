// SPEC-012: Notifications & Communication Types

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  PUSH = 'push',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  READ = 'read',
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum NotificationType {
  ORDER_CONFIRMED = 'order_confirmed',
  ORDER_COMPLETED = 'order_completed',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_REMINDER = 'payment_reminder',
  INSTALLMENT_DUE = 'installment_due',
  INSTALLMENT_OVERDUE = 'installment_overdue',
  RESERVATION_EXPIRING = 'reservation_expiring',
  RESERVATION_EXPIRED = 'reservation_expired',
  LETTER_ISSUED = 'letter_issued',
  LETTER_RECEIVED = 'letter_received',
  TRANSFER_INITIATED = 'transfer_initiated',
  TRANSFER_RECEIVED = 'transfer_received',
  SYSTEM_ALERT = 'system_alert',
  CUSTOM = 'custom',
}

// Domain Events for Outbox Pattern
export interface DomainEvent {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: Record<string, any>;
  occurredAt: Date;
}

export interface OrderConfirmedEvent extends DomainEvent {
  aggregateType: 'Order';
  eventType: 'order.confirmed';
  payload: {
    orderId: string;
    orderNumber: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    motorcycleName: string;
    totalAmount: number;
    branchId: string;
  };
}

export interface PaymentReceivedEvent extends DomainEvent {
  aggregateType: 'Payment';
  eventType: 'payment.received';
  payload: {
    paymentId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    amount: number;
    method: string;
    orderId?: string;
    orderNumber?: string;
    branchId: string;
  };
}

export interface InstallmentDueEvent extends DomainEvent {
  aggregateType: 'Installment';
  eventType: 'installment.due';
  payload: {
    installmentId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    amount: number;
    dueDate: string;
    contractId: string;
    branchId: string;
  };
}

export interface ReservationExpiringEvent extends DomainEvent {
  aggregateType: 'Reservation';
  eventType: 'reservation.expiring';
  payload: {
    reservationId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    motorcycleName: string;
    expiresAt: string;
    branchId: string;
  };
}

export interface LetterIssuedEvent extends DomainEvent {
  aggregateType: 'Letter';
  eventType: 'letter.issued';
  payload: {
    letterId: string;
    letterNumber: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    motorcycleName: string;
    type: string;
    branchId: string;
  };
}

export interface TransferInitiatedEvent extends DomainEvent {
  aggregateType: 'Transfer';
  eventType: 'transfer.initiated';
  payload: {
    transferId: string;
    motorcycleName: string;
    fromBranchId: string;
    fromBranchName: string;
    toBranchId: string;
    toBranchName: string;
    userId: string;
  };
}

// Notification Payload Interface
export interface NotificationPayload {
  type: NotificationType;
  userId: string;
  branchId?: string;
  channel: NotificationChannel;
  priority?: NotificationPriority;
  title: string;
  titleAr?: string;
  message: string;
  messageAr?: string;
  data?: Record<string, any>;
  scheduledFor?: Date;
  expiresAt?: Date;
}

// Template Rendering Context
export interface TemplateContext {
  variables: Record<string, any>;
  lang: 'en' | 'ar';
}

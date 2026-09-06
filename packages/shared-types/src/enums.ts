import { z } from "zod";

export enum Resource {
  MOTORCYCLE = "motorcycle",
  ORDER = "order",
  RESERVATION = "reservation",
  PAYMENT = "payment",
  INSTALLMENT = "installment",
  FINANCING_CONTRACT = "financing_contract",
  LETTER = "letter",
  CUSTOMER = "customer",
  SUPPLIER = "supplier",
  PURCHASE = "purchase",
  TRANSFER = "transfer",
  BRANCH = "branch",
  USER = "user",
  ROLE = "role",
  REPORT = "report",
  SETTING = "setting",
  WEB_CONTENT = "web_content",
  INVOICES = "invoices",
  PAYMENTS = "payments",
  CONFIGURATION = "configuration",
  NOTIFICATION = "notification",
  POS = "pos",
  SCHEDULER = "scheduler",
}

export enum Action {
  CREATE = "create",
  READ = "read",
  UPDATE = "update",
  DELETE = "delete",
  EXPORT = "export",
  REFUND = "refund",
  APPROVE = "approve",
  CONFIRM = "confirm",
}

export enum Language {
  AR = "ar",
  EN = "en",
}

export enum MotorcycleStatus {
  IN_TRANSIT = "in_transit",
  AVAILABLE = "available",
  RESERVED = "reserved",
  SOLD = "sold",
  IN_TRANSFER = "in_transfer",
  MAINTENANCE = "maintenance",
  RETURNED = "returned",
}

export enum PurchaseStatus {
  DRAFT = "draft",
  ORDERED = "ordered",
  PARTIALLY_RECEIVED = "partially_received",
  RECEIVED = "received",
  CANCELLED = "cancelled",
}

export enum TransferStatus {
  INITIATED = "initiated",
  IN_TRANSIT = "in_transit",
  RECEIVED = "received",
  CANCELLED = "cancelled",
}

export enum ReservationStatus {
  ACTIVE = "active",
  CONVERTED = "converted",
  EXPIRED = "expired",
  CANCELLED = "cancelled",
}

export const resourceSchema = z.nativeEnum(Resource);
export const actionSchema = z.nativeEnum(Action);
export const languageSchema = z.nativeEnum(Language);
export const motorcycleStatusSchema = z.nativeEnum(MotorcycleStatus);
export const purchaseStatusSchema = z.nativeEnum(PurchaseStatus);
export const transferStatusSchema = z.nativeEnum(TransferStatus);
export const reservationStatusSchema = z.nativeEnum(ReservationStatus);

export type PermissionKey = `${Resource}:${Action}`;

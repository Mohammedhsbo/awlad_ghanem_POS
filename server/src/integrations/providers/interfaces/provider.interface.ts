// SPEC-014: Provider Abstraction Interfaces

import { HealthCheckResult, ProviderConfig, WebhookPayload } from '../../types/integration.types.js';

export interface IProvider {
  readonly providerKey: string;
  readonly providerName: string;
  initialize(config: ProviderConfig): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
  validateConfig(config: ProviderConfig): boolean;
}

export interface IPaymentProvider extends IProvider {
  initiatePayment(params: PaymentInitiateParams): Promise<PaymentResult>;
  confirmPayment(transactionId: string): Promise<PaymentResult>;
  refundPayment(transactionId: string, amount?: number): Promise<RefundResult>;
  getPaymentStatus(transactionId: string): Promise<PaymentStatusResult>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
  parseWebhookEvent(payload: WebhookPayload): ParsedPaymentWebhook;
}

export interface PaymentInitiateParams {
  amount: number;
  currency: string;
  orderId: string;
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  description?: string;
  metadata?: Record<string, any>;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  providerTransactionId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  amount: number;
  currency: string;
  paymentUrl?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  transactionId: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
}

export interface PaymentStatusResult {
  transactionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  amount: number;
  currency: string;
  paidAt?: Date;
  metadata?: Record<string, any>;
}

export interface ParsedPaymentWebhook {
  eventType: 'payment.success' | 'payment.failed' | 'refund.completed' | 'payment.pending';
  transactionId: string;
  providerTransactionId: string;
  amount: number;
  status: string;
  metadata?: Record<string, any>;
}

export interface IEmailProvider extends IProvider {
  sendEmail(params: EmailSendParams): Promise<EmailResult>;
  getDeliveryStatus(messageId: string): Promise<EmailDeliveryStatus>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
  parseDeliveryEvent(payload: WebhookPayload): ParsedEmailWebhook;
}

export interface EmailSendParams {
  to: string | string[];
  from?: string;
  subject: string;
  text?: string;
  html?: string;
  templateId?: string;
  templateData?: Record<string, any>;
  attachments?: EmailAttachment[];
  metadata?: Record<string, any>;
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface EmailResult {
  success: boolean;
  messageId: string;
  providerMessageId?: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  error?: string;
}

export interface EmailDeliveryStatus {
  messageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'complained';
  deliveredAt?: Date;
  bouncedAt?: Date;
  failedAt?: Date;
  error?: string;
}

export interface ParsedEmailWebhook {
  eventType: 'delivered' | 'bounced' | 'complained' | 'opened' | 'clicked';
  messageId: string;
  recipient: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ISMSProvider extends IProvider {
  sendSMS(params: SMSSendParams): Promise<SMSResult>;
  getDeliveryStatus(messageId: string): Promise<SMSDeliveryStatus>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
  parseDeliveryEvent(payload: WebhookPayload): ParsedSMSWebhook;
}

export interface SMSSendParams {
  to: string;
  from?: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface SMSResult {
  success: boolean;
  messageId: string;
  providerMessageId?: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  error?: string;
}

export interface SMSDeliveryStatus {
  messageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  deliveredAt?: Date;
  failedAt?: Date;
  error?: string;
}

export interface ParsedSMSWebhook {
  eventType: 'delivered' | 'failed' | 'sent';
  messageId: string;
  recipient: string;
  status: string;
  timestamp: Date;
  error?: string;
}

export interface IWhatsAppProvider extends IProvider {
  sendTemplateMessage(params: WhatsAppTemplateParams): Promise<WhatsAppResult>;
  getMessageStatus(messageId: string): Promise<WhatsAppMessageStatus>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
  parseWebhookEvent(payload: WebhookPayload): ParsedWhatsAppWebhook;
}

export interface WhatsAppTemplateParams {
  to: string;
  templateName: string;
  templateLanguage: string;
  components?: WhatsAppComponent[];
  metadata?: Record<string, any>;
}

export interface WhatsAppComponent {
  type: 'header' | 'body' | 'button';
  parameters: WhatsAppParameter[];
}

export interface WhatsAppParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  currency?: { code: string; amount: number; fallback_value: string };
  date_time?: { fallback_value: string };
  image?: { link: string };
  document?: { link: string; filename: string };
  video?: { link: string };
}

export interface WhatsAppResult {
  success: boolean;
  messageId: string;
  providerMessageId?: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
}

export interface WhatsAppMessageStatus {
  messageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failedAt?: Date;
  error?: string;
}

export interface ParsedWhatsAppWebhook {
  eventType: 'message.sent' | 'message.delivered' | 'message.read' | 'message.failed';
  messageId: string;
  recipient: string;
  status: string;
  timestamp: Date;
  error?: string;
}

export interface IStorageProvider extends IProvider {
  uploadFile(params: FileUploadParams): Promise<FileUploadResult>;
  downloadFile(fileKey: string): Promise<FileDownloadResult>;
  generatePresignedUrl(fileKey: string, expiresIn: number, operation: 'get' | 'put'): Promise<string>;
  deleteFile(fileKey: string): Promise<boolean>;
  getFileMetadata(fileKey: string): Promise<FileMetadata>;
  listFiles(prefix?: string, limit?: number): Promise<FileListResult>;
}

export interface FileUploadParams {
  file: Buffer;
  fileName: string;
  contentType?: string;
  folder?: string;
  metadata?: Record<string, any>;
  isPublic?: boolean;
}

export interface FileUploadResult {
  success: boolean;
  fileKey: string;
  url: string;
  size: number;
  contentType: string;
  error?: string;
}

export interface FileDownloadResult {
  success: boolean;
  file: Buffer;
  contentType: string;
  size: number;
  metadata?: Record<string, any>;
  error?: string;
}

export interface FileMetadata {
  fileKey: string;
  fileName: string;
  size: number;
  contentType: string;
  uploadedAt: Date;
  url?: string;
  metadata?: Record<string, any>;
}

export interface FileListResult {
  files: FileMetadata[];
  nextToken?: string;
  hasMore: boolean;
}

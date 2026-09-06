/**
 * TASK-011: Payment Provider Integration Framework
 * 
 * This module defines the abstraction layer for external payment providers.
 * Actual provider implementations (Stripe, PayPal, Paymob, etc.) are kept
 * separate and will be implemented as needed.
 */

import { PaymentMethod, PaymentStatus } from "@motorcycle-system/shared-types";

/**
 * Payment provider configuration
 */
export interface PaymentProviderConfig {
  providerId: string;
  name: string;
  supportedMethods: PaymentMethod[];
  webhookSecret: string;
  apiKey?: string;
  merchantId?: string;
  environment: "sandbox" | "production";
  enabled: boolean;
}

/**
 * Payment creation request to provider
 */
export interface ProviderPaymentRequest {
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  metadata: Record<string, any>;
  callbackUrl?: string;
  returnUrl?: string;
}

/**
 * Payment creation response from provider
 */
export interface ProviderPaymentResponse {
  providerTransactionId: string;
  status: ProviderPaymentStatus;
  redirectUrl?: string;
  qrCode?: string;
  message?: string;
  metadata?: Record<string, any>;
}

/**
 * Provider payment status enum
 */
export enum ProviderPaymentStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
  PARTIALLY_REFUNDED = "partially_refunded",
}

/**
 * Transaction verification request
 */
export interface VerifyTransactionRequest {
  providerTransactionId: string;
  expectedAmount?: number;
  expectedReference?: string;
}

/**
 * Transaction verification response
 */
export interface VerifyTransactionResponse {
  verified: boolean;
  status: ProviderPaymentStatus;
  amount: number;
  currency: string;
  paidAt?: Date;
  failureReason?: string;
  metadata?: Record<string, any>;
}

/**
 * Refund request to provider
 */
export interface ProviderRefundRequest {
  providerTransactionId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, any>;
}

/**
 * Refund response from provider
 */
export interface ProviderRefundResponse {
  providerRefundId: string;
  status: ProviderPaymentStatus;
  refundedAmount: number;
  message?: string;
}

/**
 * Webhook event from provider
 */
export interface ProviderWebhookEvent {
  eventId: string;
  eventType: string;
  providerTransactionId: string;
  status: ProviderPaymentStatus;
  amount?: number;
  currency?: string;
  timestamp: Date;
  rawPayload: any;
  signature?: string;
}

/**
 * Webhook verification result
 */
export interface WebhookVerificationResult {
  verified: boolean;
  event?: ProviderWebhookEvent;
  error?: string;
}

/**
 * Abstract payment provider interface
 * All external payment providers must implement this interface
 */
export abstract class IPaymentProvider {
  abstract readonly providerId: string;
  abstract readonly name: string;

  /**
   * Initialize provider with configuration
   */
  abstract initialize(config: PaymentProviderConfig): Promise<void>;

  /**
   * Create a payment with the provider
   */
  abstract createPayment(
    request: ProviderPaymentRequest
  ): Promise<ProviderPaymentResponse>;

  /**
   * Verify a transaction with the provider
   */
  abstract verifyTransaction(
    request: VerifyTransactionRequest
  ): Promise<VerifyTransactionResponse>;

  /**
   * Request a refund from the provider
   */
  abstract refund(
    request: ProviderRefundRequest
  ): Promise<ProviderRefundResponse>;

  /**
   * Verify webhook signature and parse event
   */
  abstract verifyWebhook(
    rawPayload: string | Buffer,
    signature: string
  ): Promise<WebhookVerificationResult>;

  /**
   * Map provider status to internal payment status
   */
  abstract mapStatus(providerStatus: ProviderPaymentStatus): PaymentStatus;

  /**
   * Check if provider supports a specific payment method
   */
  supportsMethod(method: PaymentMethod): boolean {
    return false; // Override in implementation
  }
}

/**
 * Provider registry error
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly providerResponse?: any
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

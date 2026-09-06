// SPEC-014 TASK-013: Mock Payment Provider for Testing

import {
  IPaymentProvider,
  PaymentInitiateParams,
  PaymentResult,
  RefundResult,
  PaymentStatusResult,
  ParsedPaymentWebhook,
} from '../interfaces/provider.interface.js';
import { HealthCheckResult, ProviderConfig } from '../../types/integration.types.js';
import { HealthStatus } from '../../types/integration.types.js';

export class MockPaymentProvider implements IPaymentProvider {
  readonly providerKey = 'mock-payment';
  readonly providerName = 'Mock Payment Provider';
  private config: ProviderConfig = {};
  private transactions = new Map<string, any>();

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: HealthStatus.HEALTHY,
      responseTime: 10,
      lastCheck: new Date(),
      consecutiveFailures: 0,
      uptime: 100,
      metrics: {
        successRate: 100,
        errorRate: 0,
        avgResponseTime: 10,
      },
    };
  }

  validateConfig(config: ProviderConfig): boolean {
    return true;
  }

  async initiatePayment(params: PaymentInitiateParams): Promise<PaymentResult> {
    const transactionId = `mock_txn_${Date.now()}`;
    
    this.transactions.set(transactionId, {
      ...params,
      status: 'pending',
      createdAt: new Date(),
    });

    return {
      success: true,
      transactionId,
      providerTransactionId: transactionId,
      status: 'pending',
      amount: params.amount,
      currency: params.currency,
      paymentUrl: `https://mock-payment.example.com/pay/${transactionId}`,
    };
  }

  async confirmPayment(transactionId: string): Promise<PaymentResult> {
    const txn = this.transactions.get(transactionId);
    
    if (!txn) {
      return {
        success: false,
        transactionId,
        status: 'failed',
        amount: 0,
        currency: 'USD',
        error: 'Transaction not found',
      };
    }

    txn.status = 'completed';
    this.transactions.set(transactionId, txn);

    return {
      success: true,
      transactionId,
      providerTransactionId: transactionId,
      status: 'completed',
      amount: txn.amount,
      currency: txn.currency,
    };
  }

  async refundPayment(transactionId: string, amount?: number): Promise<RefundResult> {
    const txn = this.transactions.get(transactionId);
    
    if (!txn || txn.status !== 'completed') {
      return {
        success: false,
        refundId: '',
        transactionId,
        amount: amount || 0,
        status: 'failed',
        error: 'Transaction not found or not completed',
      };
    }

    const refundId = `mock_ref_${Date.now()}`;
    const refundAmount = amount || txn.amount;

    return {
      success: true,
      refundId,
      transactionId,
      amount: refundAmount,
      status: 'completed',
    };
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentStatusResult> {
    const txn = this.transactions.get(transactionId);
    
    if (!txn) {
      return {
        transactionId,
        status: 'failed',
        amount: 0,
        currency: 'USD',
      };
    }

    return {
      transactionId,
      status: txn.status,
      amount: txn.amount,
      currency: txn.currency,
      paidAt: txn.status === 'completed' ? new Date() : undefined,
    };
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // Mock implementation always returns true
    return true;
  }

  parseWebhookEvent(payload: any): ParsedPaymentWebhook {
    return {
      eventType: payload.event_type || 'payment.success',
      transactionId: payload.transaction_id || '',
      providerTransactionId: payload.provider_transaction_id || '',
      amount: payload.amount || 0,
      status: payload.status || 'completed',
      metadata: payload.metadata,
    };
  }
}

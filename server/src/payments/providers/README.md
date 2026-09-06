# Payment Provider Integration Framework

## Overview

This directory contains the abstraction layer for integrating external payment providers (TASK-011).

**Status**: Framework implemented, no actual providers included.

Actual provider implementations (Stripe, PayPal, Paymob, etc.) are kept separate and will be implemented as plugins when needed.

## Architecture

```
┌─────────────────────────────────────────┐
│   Payment Service (Internal Logic)     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   Payment Provider Registry             │
│   - Provider registration               │
│   - Provider discovery                  │
│   - Configuration management            │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   IPaymentProvider Interface            │
│   - createPayment()                     │
│   - verifyTransaction()                 │
│   - refund()                            │
│   - verifyWebhook()                     │
│   - mapStatus()                         │
└──────────────┬──────────────────────────┘
               │
         ┌─────┴─────────────┐
         ▼                   ▼
    ┌─────────┐        ┌──────────┐
    │ Stripe  │        │ Paymob   │
    │Provider │        │Provider  │
    │(Future) │        │(Future)  │
    └─────────┘        └──────────┘
```

## Files

### `payment-provider.interface.ts`
Defines the abstract interface that all payment providers must implement.

**Key Interfaces**:
- `IPaymentProvider` - Abstract base class
- `PaymentProviderConfig` - Provider configuration
- `ProviderPaymentRequest/Response` - Payment creation
- `VerifyTransactionRequest/Response` - Transaction verification
- `ProviderRefundRequest/Response` - Refund processing
- `ProviderWebhookEvent` - Webhook event structure
- `ProviderError` - Provider-specific errors

### `payment-provider.registry.ts`
Manages registration and retrieval of payment provider implementations.

**Features**:
- Provider registration at startup
- Provider lookup by ID
- Provider discovery by payment method
- Enable/disable providers
- Configuration management

### `webhook-processor.service.ts`
Handles idempotent processing of payment provider webhooks.

**Features**:
- Signature verification
- Idempotent processing (duplicate detection)
- Payment status reconciliation
- Audit trail
- Error handling

## Usage

### 1. Implementing a Provider

```typescript
import { IPaymentProvider, PaymentProviderConfig, ... } from './payment-provider.interface.js';

export class StripeProvider extends IPaymentProvider {
  readonly providerId = 'stripe';
  readonly name = 'Stripe';
  
  private apiKey: string;
  
  async initialize(config: PaymentProviderConfig): Promise<void> {
    this.apiKey = config.apiKey!;
    // Initialize Stripe SDK
  }
  
  async createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResponse> {
    // Call Stripe API
  }
  
  async verifyTransaction(request: VerifyTransactionRequest): Promise<VerifyTransactionResponse> {
    // Verify with Stripe
  }
  
  async refund(request: ProviderRefundRequest): Promise<ProviderRefundResponse> {
    // Process refund via Stripe
  }
  
  async verifyWebhook(rawPayload: string | Buffer, signature: string): Promise<WebhookVerificationResult> {
    // Verify Stripe webhook signature
  }
  
  mapStatus(providerStatus: ProviderPaymentStatus): PaymentStatus {
    // Map Stripe status to internal status
  }
  
  supportsMethod(method: PaymentMethod): boolean {
    return method === PaymentMethod.CARD;
  }
}
```

### 2. Registering a Provider

```typescript
import { PaymentProviderRegistry } from './payment-provider.registry.js';
import { StripeProvider } from './implementations/stripe.provider.js';

// In module initialization
const registry = new PaymentProviderRegistry();

const stripeProvider = new StripeProvider();
const stripeConfig = {
  providerId: 'stripe',
  name: 'Stripe',
  supportedMethods: [PaymentMethod.CARD],
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  apiKey: process.env.STRIPE_API_KEY!,
  environment: 'production',
  enabled: true,
};

registry.register(stripeProvider, stripeConfig);
```

### 3. Using a Provider

```typescript
// Get provider
const provider = this.providerRegistry.getProvider('stripe');

// Create payment
const response = await provider.createPayment({
  amount: 1000,
  currency: 'EGP',
  method: PaymentMethod.CARD,
  reference: 'PAY-123',
  metadata: { invoiceId: 'INV-123' },
});

// Verify transaction
const verification = await provider.verifyTransaction({
  providerTransactionId: response.providerTransactionId,
  expectedAmount: 1000,
});
```

### 4. Handling Webhooks

Webhooks are processed through the `WebhookController`:

```
POST /api/webhooks/payments/:providerId
```

The webhook processor:
1. Verifies the webhook signature
2. Checks for duplicate events (idempotency)
3. Updates payment status
4. Updates invoice status if needed
5. Logs the event for audit

## Provider Status Mapping

Each provider must map their statuses to internal `PaymentStatus`:

| Internal Status | Description |
|-----------------|-------------|
| `PENDING` | Payment initiated, awaiting confirmation |
| `COMPLETED` | Payment successfully completed |
| `FAILED` | Payment failed |
| `CANCELLED` | Payment cancelled by user/system |
| `REFUNDED` | Full refund issued |
| `PARTIALLY_REFUNDED` | Partial refund issued |

## Security

### Webhook Signature Verification

Each provider implements signature verification:

```typescript
async verifyWebhook(
  rawPayload: string | Buffer,
  signature: string
): Promise<WebhookVerificationResult> {
  // Provider-specific signature verification
  // Return { verified: true, event: ... } or { verified: false, error: ... }
}
```

**Important**: Always use the raw request body for signature verification, not the parsed JSON.

### Idempotency

Webhook events are deduplicated using:
- `providerId` + `eventId` unique constraint
- Check before processing
- Return success for duplicates without reprocessing

### Error Handling

```typescript
try {
  const result = await provider.createPayment(request);
} catch (error) {
  if (error instanceof ProviderError) {
    // Handle provider-specific error
    console.error(`Provider error: ${error.code}`, error.providerResponse);
  }
  throw error;
}
```

## Configuration

Provider configuration should be stored securely:

```typescript
interface PaymentProviderConfig {
  providerId: string;
  name: string;
  supportedMethods: PaymentMethod[];
  webhookSecret: string;      // From environment
  apiKey?: string;            // From environment
  merchantId?: string;        // From environment
  environment: 'sandbox' | 'production';
  enabled: boolean;
}
```

**Never commit credentials to the repository.**

Use environment variables:
- `STRIPE_API_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PAYMOB_API_KEY`
- `PAYMOB_WEBHOOK_SECRET`
- etc.

## Testing

### Mock Provider

Create a mock provider for testing:

```typescript
export class MockProvider extends IPaymentProvider {
  readonly providerId = 'mock';
  readonly name = 'Mock Provider';
  
  async initialize(config: PaymentProviderConfig): Promise<void> {
    // No-op
  }
  
  async createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResponse> {
    return {
      providerTransactionId: 'mock_' + Date.now(),
      status: ProviderPaymentStatus.COMPLETED,
    };
  }
  
  // ... implement other methods
}
```

### Webhook Testing

Test webhook processing:

```typescript
// Simulate webhook event
const mockEvent = {
  eventId: 'evt_123',
  eventType: 'payment.completed',
  providerTransactionId: 'tx_456',
  status: ProviderPaymentStatus.COMPLETED,
  timestamp: new Date(),
  rawPayload: {},
};

const result = await webhookProcessor.processWebhook({
  providerId: 'mock',
  rawPayload: JSON.stringify(mockEvent),
  signature: 'valid_signature',
  headers: {},
});
```

## Future Provider Implementations

When adding a new provider:

1. Create `providers/implementations/{provider-name}.provider.ts`
2. Implement `IPaymentProvider` interface
3. Add provider configuration to environment
4. Register provider at application startup
5. Add webhook endpoint documentation
6. Add integration tests

## Database Schema

### WebhookEvent Table

Stores webhook events for idempotency and audit:

```sql
CREATE TABLE "WebhookEvent" (
  "id" UUID PRIMARY KEY,
  "providerId" VARCHAR(50),
  "eventId" VARCHAR(200),
  "eventType" VARCHAR(100),
  "providerTransactionId" VARCHAR(200),
  "paymentId" UUID,
  "status" VARCHAR(50),
  "result" VARCHAR(50),
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP
);

CREATE UNIQUE INDEX ON "WebhookEvent" ("providerId", "eventId");
```

## Limitations

**Not Implemented**:
- Actual provider implementations (Stripe, PayPal, Paymob)
- Provider SDK integrations
- 3D Secure handling
- Card tokenization
- Recurring payments
- Multi-currency conversion

These will be implemented as separate modules/plugins as needed.

## References

- [Stripe API Documentation](https://stripe.com/docs/api)
- [PayPal API Documentation](https://developer.paypal.com/api/rest/)
- [Paymob API Documentation](https://docs.paymob.com/)

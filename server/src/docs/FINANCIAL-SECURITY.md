# Financial Transaction Safety & Security

## Overview

This document describes the security measures and transaction safety mechanisms implemented for SPEC-008 financial operations (TASK-012 and TASK-013).

## TASK-012: Transaction Safety

### Concurrency Protection

#### 1. Row-Level Locking

All critical financial operations use `SELECT ... FOR UPDATE` to lock rows:

```typescript
// Lock invoice before payment
const lockedInvoice = await lockInvoiceForUpdate(tx, invoiceId);

// Lock payment before refund
const { payment, refunds } = await lockPaymentWithRefunds(tx, paymentId);
```

**Prevents**:
- Concurrent payments on same invoice
- Concurrent refunds on same payment
- Race conditions during status updates

#### 2. Transaction Boundaries

All financial operations are wrapped in database transactions:

```typescript
await prisma.$transaction(async (tx) => {
  // All operations here are atomic
  // Either all succeed or all rollback
});
```

**Guarantees**:
- Atomicity: All operations succeed or none do
- Consistency: Database constraints enforced
- Isolation: Operations don't interfere with each other
- Durability: Committed changes are permanent

#### 3. Deadlock Retry

Automatic retry with exponential backoff for deadlock scenarios:

```typescript
await retryOnDeadlock(async () => {
  // Financial operation here
}, maxRetries = 3, delayMs = 100);
```

**Handles**:
- PostgreSQL deadlock errors (40P01)
- Prisma deadlock errors (P2034)
- Automatic retry with increasing delays

#### 4. Idempotency Protection

All payment operations require unique idempotency keys:

```typescript
const existing = await prisma.payment.findUnique({
  where: { idempotencyKey: data.idempotencyKey },
});

if (existing) {
  return existing; // Idempotent: return existing payment
}
```

**Prevents**:
- Duplicate payments from network retries
- Double-charging customers
- Balance corruption from repeated requests

**Idempotency Key Retention**: 24 hours (configurable)

#### 5. Balance Integrity Validation

Automatic validation of financial balance equations:

```typescript
// Invoice: paidAmount + remainingAmount = totalAmount
validateInvoiceBalance({
  totalAmount,
  paidAmount,
  remainingAmount,
});

// Payment: sum(refunds) <= payment.amount
validatePaymentRefundBalance(paymentAmount, totalRefunded);

// No negative amounts allowed
validateNoNegativeAmounts({
  paidAmount,
  remainingAmount,
});
```

**Detects**:
- Balance corruption
- Arithmetic errors
- Concurrent modification issues

### Critical Scenarios Handled

#### Scenario 1: Concurrent Payments

**Problem**: Two users pay same invoice simultaneously

**Solution**:
```typescript
// Lock invoice FOR UPDATE
const lockedInvoice = await lockInvoiceForUpdate(tx, invoiceId);

// Check remaining balance
if (paymentAmount > lockedInvoice.remainingAmount) {
  throw new Error("INVALID_PAYMENT_AMOUNT");
}

// Update invoice (other transactions wait)
await tx.invoice.update({ ... });
```

**Result**: Second payment fails with clear error, first payment succeeds

#### Scenario 2: Concurrent Refunds

**Problem**: Two refunds target same payment simultaneously

**Solution**:
```typescript
// Lock payment AND all refunds FOR UPDATE
const { payment, refunds } = await lockPaymentWithRefunds(tx, paymentId);

// Calculate total refunded (locked data)
const totalRefunded = sum(refunds);

// Validate refund amount
if (newRefund + totalRefunded > payment.amount) {
  throw new Error("REFUND_EXCEEDS_PAYMENT");
}
```

**Result**: Only valid refund succeeds, invalid one fails with clear error

#### Scenario 3: Payment During Cancellation

**Problem**: Payment happens while invoice cancellation is attempted

**Solution**:
- Both operations lock the invoice
- Whichever locks first proceeds
- Second operation sees updated status and fails appropriately

```typescript
// In payment: lock invoice, check status
if (invoice.status === 'cancelled') {
  throw new Error("INVALID_INVOICE_STATUS");
}

// In cancellation: lock invoice, check payments
if (invoice.paidAmount > 0) {
  throw new Error("CANNOT_CANCEL_PAID_INVOICE");
}
```

#### Scenario 4: Reservation Conversion During Payment

**Problem**: Reservation converts to order while payment is being processed

**Solution**:
- Reservation financial transfer locks both invoices
- Payment operations lock invoices
- Operations are serialized by database locks

#### Scenario 5: Duplicate Payment Request

**Problem**: Network timeout causes client to retry payment

**Solution**:
```typescript
// Idempotency key check BEFORE transaction
const existing = await prisma.payment.findUnique({
  where: { idempotencyKey },
});

if (existing) {
  // Return existing payment (idempotent)
  return existing;
}

// Only create if doesn't exist
await prisma.$transaction(async (tx) => {
  // Payment creation with unique constraint on idempotencyKey
});
```

**Result**: Same payment returned, no duplicate charge

#### Scenario 6: Duplicate Webhook

**Problem**: Payment provider sends same webhook event twice

**Solution**:
```typescript
// Check if event already processed
const existing = await prisma.webhookEvent.findFirst({
  where: {
    providerId,
    eventId,
  },
});

if (existing) {
  return { processed: false, message: "Duplicate event" };
}

// Process and store event atomically
await prisma.$transaction(async (tx) => {
  // Update payment status
  // Store webhook event
});
```

**Result**: Webhook processed once, duplicates ignored

#### Scenario 7: Network Timeout After Commit

**Problem**: Transaction commits but network fails before response

**Solution**:
- Idempotency key prevents duplicate on retry
- Audit log contains commit timestamp
- Client can query payment status by idempotency key

### Safe Decimal Arithmetic

All financial calculations use safe decimal functions:

```typescript
// Avoid floating point errors
const total = safeAdd(price1, price2, price3);
const remaining = safeSubtract(total, paid);
const amount = safeMultiply(unitPrice, quantity);

// Compare with tolerance
if (decimalsEqual(calculated, expected, 0.01)) {
  // Values match within 1 cent
}
```

### Error Handling

Financial operations use specific error codes:

```typescript
// Payment errors
INVALID_PAYMENT_AMOUNT
DUPLICATE_PAYMENT
INVOICE_NOT_FOUND
INVALID_INVOICE_STATUS
CASH_CALCULATION_ERROR
BRANCH_ACCESS_VIOLATION

// Refund errors
REFUND_EXCEEDS_PAYMENT
INVALID_PAYMENT_STATUS
UNAUTHORIZED_REFUND

// Concurrency errors
CONCURRENT_UPDATE_CONFLICT
INVOICE_BALANCE_CORRUPTION
PAYMENT_REFUND_CORRUPTION
NEGATIVE_AMOUNT

// Idempotency errors
INVALID_IDEMPOTENCY_KEY
```

## TASK-013: Financial Audit

### Audit Coverage

All financial operations are logged:

#### Invoice Operations
- `invoice.created` - Invoice creation
- `invoice.issued` - Draft → Issued
- `invoice.cancelled` - Cancellation
- `invoice.status_changed` - Any status change
- `invoice.updated` - Metadata updates

#### Payment Operations
- `payment.created` - Payment creation
- `payment.confirmed` - Pending → Completed
- `payment.cancelled` - Cancellation
- `payment.failed` - Failure
- `payment.status_changed` - Status change
- `payment.applied_to_invoice` - Invoice update
- `payment.duplicate_attempted` - Idempotency hit

#### Refund Operations
- `refund.created` - Refund creation
- `refund.completed` - Completion
- `refund.failed` - Failure
- `refund.cancelled` - Cancellation
- `refund.applied_to_payment` - Payment status update
- `refund.applied_to_invoice` - Invoice reversal

#### Webhook Operations
- `webhook.received` - Webhook received
- `webhook.processed` - Successfully processed
- `webhook.rejected` - Signature verification failed
- `webhook.duplicate` - Duplicate event detected

#### System Operations
- `financial.reconciliation` - Manual reconciliation
- `balance.integrity_check` - Validation passed
- `balance.integrity_failure` - Validation failed
- `concurrent.operation_conflict` - Concurrent conflict
- `deadlock.retry` - Deadlock retry attempt
- `idempotency.key_used` - Idempotency key reused

### Audit Entry Structure

Every audit entry includes:

```json
{
  "id": "uuid",
  "userId": "user-id or 'system'",
  "action": "payment.created",
  "entityType": "payment",
  "entityId": "payment-id",
  "branchId": "branch-id",
  "before": { /* old state */ },
  "after": { /* new state */ },
  "createdAt": "2024-01-01T12:00:00Z"
}
```

### Sensitive Data Masking

The following data is **NEVER** logged:

- Full card numbers (only last 4 digits)
- CVV/CVC codes
- Card expiry dates
- API keys
- Webhook secrets
- Private keys
- Passwords

Masked fields:
```json
{
  "cardNumber": "***REDACTED***",
  "cvv": "***REDACTED***",
  "apiKey": "***REDACTED***",
  "externalTransactionId": "*******4567" // Last 4 shown
}
```

### Audit Immutability

Audit records are **immutable**:
- No UPDATE operations allowed
- No DELETE operations allowed
- Only INSERT and SELECT
- Enforced by database permissions

### Audit Queries

Query audit trail for entity:
```typescript
const trail = await financialAuditService.getAuditTrail({
  entityType: 'payment',
  entityId: 'payment-123',
  fromDate: new Date('2024-01-01'),
  toDate: new Date('2024-12-31'),
  limit: 100,
});
```

Query by action type:
```typescript
const failedPayments = await financialAuditService.getFinancialAuditsByAction({
  action: FinancialAuditAction.PAYMENT_FAILED,
  branchId: 'branch-id',
  fromDate: lastMonth,
  limit: 50,
});
```

### Failed Operation Logging

Failed operations are also logged:

```typescript
await financialAuditService.logFailedOperation({
  userId,
  action: 'payment.create',
  entityType: 'payment',
  entityId: 'attempted-payment-id',
  branchId,
  errorCode: 'INVALID_PAYMENT_AMOUNT',
  errorMessage: 'Payment exceeds remaining balance',
  attemptedData: { amount, invoiceId }, // Sanitized
});
```

## Security Measures

### 1. Branch Isolation

All financial operations enforce branch scoping:

```typescript
// Staff can only access own branch
if (!isSuperAdmin && entity.branchId !== userBranchId) {
  throw new ForbiddenException("BRANCH_ACCESS_VIOLATION");
}

// Super admin can access all branches
```

**Prevents**: Cross-branch data access

### 2. Authorization

RBAC enforced at controller level:

```typescript
@RequirePermission(Resource.PAYMENTS, Action.CREATE)
async createPayment(...) {
  // Only users with payment.create permission can access
}
```

**Prevents**: Unauthorized financial operations

### 3. Customer Privacy

Customers can only access own financial data:

```typescript
if (isCustomer && invoice.customerId !== requestingCustomerId) {
  // Return 404 instead of 403 for privacy
  throw new NotFoundException("INVOICE_NOT_FOUND");
}
```

**Prevents**: Customer data leakage

### 4. Idempotency Key Validation

Strict validation of idempotency keys:

```typescript
function validateIdempotencyKey(key: string): boolean {
  // Must be at least 10 characters
  if (key.length < 10) return false;
  
  // Only alphanumeric, dash, underscore
  if (!/^[a-zA-Z0-9\-_]+$/.test(key)) return false;
  
  return true;
}
```

**Prevents**: Injection attacks, weak keys

### 5. Input Validation

All financial inputs validated:

```typescript
// Amount validation
if (amount <= 0) {
  throw new BadRequestException("INVALID_AMOUNT");
}

// Method validation
if (!Object.values(PaymentMethod).includes(method)) {
  throw new BadRequestException("INVALID_PAYMENT_METHOD");
}

// Cash validation
if (method === CASH && amountReceived < amount) {
  throw new BadRequestException("INSUFFICIENT_CASH");
}
```

**Prevents**: Invalid data, negative amounts

### 6. SQL Injection Protection

All database queries use parameterized statements:

```typescript
// Safe: Prisma parameterized query
await tx.$queryRaw`
  SELECT * FROM "Invoice"
  WHERE id = ${invoiceId}::uuid
  FOR UPDATE
`;

// NEVER use string concatenation
```

**Prevents**: SQL injection attacks

## Testing

### Required Test Scenarios

1. **Concurrent Payment Test**
   - Two simultaneous payments on same invoice
   - Verify only one succeeds or both succeed with correct balance

2. **Concurrent Refund Test**
   - Two simultaneous refunds on same payment
   - Verify total refunds don't exceed payment

3. **Duplicate Payment Test**
   - Same idempotency key used twice
   - Verify second attempt returns existing payment

4. **Duplicate Refund Test**
   - Same refund attempted twice
   - Verify idempotency protection

5. **Branch Isolation Test**
   - User from Branch A attempts access to Branch B payment
   - Verify access denied

6. **Authorization Test**
   - User without payment permission attempts payment
   - Verify access denied

7. **Audit Completeness Test**
   - Perform financial operation
   - Verify audit log entry created

8. **Audit Immutability Test**
   - Attempt to modify audit record
   - Verify modification prevented

9. **Sensitive Data Masking Test**
   - Create payment with card details
   - Verify card number masked in audit log

10. **Balance Integrity Test**
    - Create payment
    - Verify invoice balance equation holds
    - Attempt to corrupt balance
    - Verify validation catches it

## Performance Considerations

### Lock Duration

Minimize lock duration:
```typescript
// BAD: Long-running external call inside transaction
await tx.$transaction(async (tx) => {
  const locked = await lockInvoice(tx, id);
  await externalPaymentAPI.charge(); // SLOW!
  await tx.invoice.update(...);
});

// GOOD: External call outside transaction
const result = await externalPaymentAPI.charge();
await tx.$transaction(async (tx) => {
  const locked = await lockInvoice(tx, id);
  await tx.invoice.update(...);
});
```

### Deadlock Prevention

Lock order consistency:
```typescript
// Always lock in same order: Invoice → Payment → Refund
// This prevents circular deadlocks
```

### Audit Performance

Async audit logging (doesn't block operations):
```typescript
// Audit log failures don't break operations
try {
  await audit.log(...);
} catch (error) {
  console.error("Audit failed:", error);
  // Operation continues
}
```

## Monitoring

### Key Metrics

- Concurrent conflict rate
- Deadlock retry rate
- Idempotency key hit rate
- Failed payment rate
- Refund rate
- Balance integrity failure rate

### Alerts

Alert on:
- Balance integrity failures
- High concurrent conflict rate
- Repeated idempotency key reuse
- Unusual refund patterns
- Authorization violations

## Recovery Procedures

### Balance Corruption

If balance corruption detected:
1. Identify affected invoice/payment
2. Calculate correct values from audit trail
3. Manual correction with super admin approval
4. Full audit log of correction

### Duplicate Payment

If duplicate payment created (bug):
1. Identify duplicate by amount/time/customer
2. Issue full refund on duplicate
3. Mark as system error refund
4. Investigate root cause

### Lost Webhook

If webhook not received:
1. Manual reconciliation endpoint available
2. Queries payment provider for status
3. Updates local payment status
4. Audit logs reconciliation

## Compliance

### Data Retention

- Audit logs: Retained indefinitely
- Payment records: Retained per legal requirements
- Idempotency keys: Purged after 24 hours

### PCI Compliance

- Never store full card numbers
- Never log sensitive payment data
- All card processing via certified providers
- Audit trail for all card transactions

### GDPR Compliance

- Customer can request financial data export
- Audit logs include customer data access
- Data anonymization for deleted customers
- Right to be forgotten (with legal exceptions for financial records)

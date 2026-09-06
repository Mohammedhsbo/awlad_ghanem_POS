# Financial Testing Requirements - SPEC-008 BATCH 4

This document outlines required tests for TASK-012 (Financial Transaction Safety) and TASK-013 (Financial Audit).

## Test Implementation Status

**TESTS ARE DOCUMENTED BUT NOT IMPLEMENTED**

Per user directive: "Document test requirements (no implementation, just documentation)"

Tests should be implemented separately after BATCH 4 completion.

---

## TASK-012: Financial Transaction Safety Tests

### 1. Concurrent Payment Tests

#### Test: Two Simultaneous Payments on Same Invoice
**Scenario**: Two users attempt to pay the same invoice at exactly the same time.

**Expected Behavior**:
- Only one payment succeeds
- The second payment either waits for lock or fails gracefully
- Invoice `paidAmount` reflects exactly one payment
- No duplicate payment records
- Audit log shows both attempts with proper outcomes

**Implementation Notes**:
- Use `Promise.all()` with two concurrent payment requests
- Verify database state after both complete
- Check idempotency key handling

---

#### Test: Payment During Invoice Cancellation
**Scenario**: Invoice cancellation starts while payment is being processed.

**Expected Behavior**:
- Row-level lock prevents race condition
- Either payment completes first (invoice cannot be cancelled) OR cancellation completes first (payment fails with INVALID_INVOICE_STATUS)
- No corrupted invoice state
- Audit log shows proper sequence

**Implementation Notes**:
- Use `lockInvoiceForUpdate()` in both operations
- Verify status transitions are atomic

---

### 2. Concurrent Refund Tests

#### Test: Two Simultaneous Refunds on Same Payment
**Scenario**: Two users attempt to refund the same payment simultaneously.

**Expected Behavior**:
- Both refunds processed only if total doesn't exceed payment amount
- If total would exceed payment, second refund fails with REFUND_EXCEEDS_PAYMENT
- Payment status correctly reflects total refunded amount
- No over-refunding
- Audit log shows both operations

**Implementation Notes**:
- Use `lockPaymentWithRefunds()` to ensure atomic validation
- Test with exact amounts (e.g., $50 payment, two $30 refund attempts)

---

### 3. Duplicate Payment Tests

#### Test: Duplicate Payment via Idempotency Key
**Scenario**: Same payment request sent twice with same idempotency key (simulates network retry).

**Expected Behavior**:
- First request creates payment
- Second request returns the SAME payment (not error, not new payment)
- Only one payment record exists
- Invoice paid only once
- Audit log shows idempotency reuse

**Implementation Notes**:
- Send identical `CreatePaymentRequest` with same `idempotencyKey`
- Verify returned payment IDs are identical
- Check database for single payment record

---

#### Test: Duplicate Payment Without Idempotency Key
**Scenario**: Same payment details sent twice without idempotency key.

**Expected Behavior**:
- System should allow (business rules may permit multiple payments)
- Each payment gets unique reference number
- Invoice properly tracks both payments
- No balance corruption

**Implementation Notes**:
- This tests that lack of idempotency key doesn't break the system
- Verify invoice `paidAmount` = sum of all payments

---

### 4. Deadlock Recovery Tests

#### Test: Deadlock on Concurrent Payment + Refund
**Scenario**: Payment creation and refund processing on related records create deadlock.

**Expected Behavior**:
- `retryOnDeadlock()` wrapper automatically retries
- Operations eventually succeed (possibly after retry)
- No lost transactions
- Audit log shows retry attempts if configured

**Implementation Notes**:
- This is difficult to reproduce deterministically
- May require database-specific deadlock injection
- Alternative: verify `retryOnDeadlock()` logic with mock errors

---

### 5. Balance Integrity Tests

#### Test: Invoice Balance Corruption Detection
**Scenario**: Attempt to create payment when invoice balance is already corrupted (paidAmount + remainingAmount ≠ totalAmount).

**Expected Behavior**:
- `validateInvoiceBalance()` throws INVOICE_BALANCE_CORRUPTION
- Payment transaction rolled back
- Audit log records failed attempt

**Implementation Notes**:
- Manually corrupt invoice balance in test database
- Attempt payment creation
- Verify detection and rollback

---

#### Test: Negative Balance Prevention
**Scenario**: Attempt to create refund that would cause negative `remainingAmount`.

**Expected Behavior**:
- `validateNoNegativeAmounts()` throws NEGATIVE_AMOUNT
- Refund transaction rolled back
- Original balances unchanged

**Implementation Notes**:
- Test with refund amount > payment amount
- Test with invoice reversal causing negative remaining

---

### 6. Payment Allocation Tests

#### Test: Concurrent Allocation to Same Invoice
**Scenario**: Two payments allocated to same invoice simultaneously.

**Expected Behavior**:
- Row-level invoice lock prevents race condition
- Both payments processed sequentially
- Invoice `paidAmount` = sum of both payments
- No lost allocations

---

### 7. Reservation Conversion Tests

#### Test: Payment During Reservation → Order Conversion
**Scenario**: New payment attempted while reservation is converting to order (TASK-009).

**Expected Behavior**:
- Proper locking prevents double-payment
- Payment associates with correct entity (reservation OR order)
- Financial history preserved during conversion

**Implementation Notes**:
- Requires TASK-009 integration
- Test with concurrent payment + conversion

---

### 8. Webhook Idempotency Tests

#### Test: Duplicate Webhook Delivery
**Scenario**: Payment provider webhook delivered multiple times (network retry).

**Expected Behavior**:
- First webhook processes payment
- Subsequent webhooks recognized as duplicate (idempotency)
- Only one payment confirmation created
- Audit log shows duplicate detection

**Implementation Notes**:
- Requires TASK-011 webhook framework
- Send identical webhook payload twice

---

## TASK-013: Financial Audit Tests

### 1. Audit Completeness Tests

#### Test: Payment Creation Audit
**Expected Audit Entry**:
```typescript
{
  action: "create",
  entityType: "payment",
  entityId: "<payment-id>",
  userId: "<user-id>",
  branchId: "<branch-id>",
  before: null,
  after: { /* full payment object */ },
  timestamp: "<iso-date>",
}
```

**Verification**:
- Audit entry created atomically with payment
- All required fields present
- Sensitive data masked (see below)

---

#### Test: Invoice Status Change Audit
**Expected Audit Entry**:
```typescript
{
  action: "update",
  entityType: "invoice",
  entityId: "<invoice-id>",
  userId: "<user-id>",
  branchId: "<branch-id>",
  before: { status: "issued", paidAmount: 0, ... },
  after: { status: "partially_paid", paidAmount: 50, ... },
  timestamp: "<iso-date>",
}
```

**Verification**:
- Both `before` and `after` states captured
- Status transition documented
- Amount changes recorded

---

#### Test: Refund Creation Audit
**Expected Audit Entry**:
```typescript
{
  action: "create",
  entityType: "refund",
  entityId: "<refund-id>",
  userId: "<user-id>",
  branchId: "<branch-id>",
  before: null,
  after: { /* full refund object */ },
  timestamp: "<iso-date>",
}
```

---

### 2. Sensitive Data Masking Tests

#### Test: Payment Method Masking
**Scenario**: Audit log for payment with credit card.

**Expected Behavior**:
- Card numbers masked: `"card": "****1234"`
- CVV never logged
- Provider credentials never logged
- Customer name preserved (not sensitive in this context)

**Implementation Notes**:
- Use `FinancialAuditService.logFinancialOperation()`
- Verify masking in audit record

---

#### Test: No Secret Logging
**Scenario**: Payment with provider API credentials.

**Expected Behavior**:
- Provider API keys NEVER appear in audit log
- Provider secrets NEVER appear in audit log
- Webhook signatures logged (not sensitive after verification)

---

### 3. Audit Immutability Tests

#### Test: Audit Record Cannot Be Modified
**Scenario**: Attempt to update existing audit record.

**Expected Behavior**:
- Prisma model has no update/delete operations exposed
- Service layer provides no update methods
- Database constraints prevent modification (if configured)

**Implementation Notes**:
- Verify `AuditService` has no `update()` or `delete()` methods
- Attempt direct database modification (should fail if constraints exist)

---

#### Test: Audit Record Cannot Be Deleted
**Scenario**: Attempt to delete audit record.

**Expected Behavior**:
- No delete operations exposed
- Database retention policy separate from application logic

---

### 4. Branch Isolation Tests

#### Test: Audit Log Respects Branch Boundaries
**Scenario**: User in Branch A creates payment in Branch B (if super admin).

**Expected Behavior**:
- Audit entry records correct `branchId` (Branch B)
- User's home branch not confused with transaction branch
- Branch-scoped audit queries return correct records

---

#### Test: Cross-Branch Audit Access Control
**Scenario**: Branch A user attempts to view Branch B audit logs.

**Expected Behavior**:
- Non-super-admin users cannot access other branches' audit logs
- Super admins can access all audit logs
- Authorization enforced at service layer

---

### 5. Failed Operation Audit Tests

#### Test: Failed Payment Audit
**Scenario**: Payment creation fails due to insufficient balance validation.

**Expected Behavior**:
- Audit log records failed attempt
- Error code/message included
- No `after` state (transaction rolled back)
- `before` state captured if available

**Implementation Notes**:
- Current implementation may not log failures
- Consider adding try/catch in service layer to audit failures

---

### 6. Actor Tracking Tests

#### Test: Audit Records Correct User
**Scenario**: Multiple users performing financial operations.

**Expected Behavior**:
- Each audit entry has correct `userId`
- User information retrievable from audit log
- System operations (webhooks) have identifiable actor (e.g., "system" or webhook identifier)

---

## Authorization Tests

### Test: Branch Isolation on Payments
**Scenario**: Branch A user attempts to create payment for Branch B invoice.

**Expected Behavior**:
- Operation fails with BRANCH_ACCESS_VIOLATION
- No payment created
- Audit log records attempted violation

---

### Test: Permission-Based Refund Access
**Scenario**: User without refund permission attempts to create refund.

**Expected Behavior**:
- Operation fails with INSUFFICIENT_PERMISSIONS
- Existing permissions guard blocks request
- Audit log records attempt

---

## Test Execution Notes

### Test Environment
- Use dedicated test database
- Reset database between test suites (not between individual tests where state matters)
- Use test branches (not production branch IDs)

### Concurrency Testing
- Use `Promise.all()` for true concurrent execution
- Consider using database connection pooling stress tests
- Verify with database query logs (EXPLAIN ANALYZE)

### Audit Verification
- Query `Audit` table directly in tests
- Use `FinancialAuditService` for retrieval where appropriate
- Verify JSON structure of `before`/`after` fields

### Performance Considerations
- Row-level locking tests may be slow (by design)
- Deadlock tests may require retry delays
- Audit log queries should be indexed for performance (verify with EXPLAIN)

---

## Test Coverage Goals

**Critical Path**: 100% coverage
- Payment creation
- Refund creation
- Invoice status transitions
- Balance integrity validation
- Concurrent operation locking

**Audit**: 100% coverage
- All financial operations logged
- Sensitive data properly masked
- Immutability enforced

**Authorization**: 100% coverage
- Branch isolation
- Permission checks
- Super admin overrides

**Edge Cases**: 90%+ coverage
- Duplicate webhooks
- Deadlock recovery
- Idempotency key reuse
- Negative balance prevention

---

## Test Implementation Priority

1. **HIGH PRIORITY**:
   - Concurrent payment tests
   - Concurrent refund tests
   - Idempotency tests
   - Balance integrity tests
   - Audit completeness tests

2. **MEDIUM PRIORITY**:
   - Sensitive data masking tests
   - Authorization tests
   - Branch isolation tests
   - Failed operation audit tests

3. **LOW PRIORITY** (but still important):
   - Deadlock recovery tests (hard to reproduce)
   - Audit immutability tests (requires database-level testing)
   - Performance stress tests

---

## Next Steps

1. Implement tests in `apps/api/src/payments/payments.service.spec.ts`
2. Implement tests in `apps/api/src/refunds/refunds.service.spec.ts`
3. Implement tests in `apps/api/src/invoices/invoices.service.spec.ts`
4. Implement audit tests in `apps/api/src/audit/financial-audit.service.spec.ts`
5. Run test suite: `cd apps/api && npm run test`
6. Review coverage report
7. Address gaps

---

**IMPORTANT**: These tests validate the security and integrity mechanisms implemented in BATCH 4. They are critical for production deployment of the financial system.

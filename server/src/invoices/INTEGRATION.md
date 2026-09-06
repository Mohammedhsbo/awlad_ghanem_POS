# Invoice Integration Documentation

## Overview

This document describes the integration between Invoices, Reservations, and Orders (TASK-009 and TASK-010).

## TASK-009: Reservation Deposit Integration

### Purpose

Convert reservation deposits to payment records seamlessly, maintaining financial integrity when reservations are created and when they convert to orders.

### Flow Diagram

```
Reservation Created with Deposit
         ↓
┌─────────────────────────────┐
│ Create Invoice for          │
│ Reservation                 │
│ - Generate invoice number   │
│ - Link to reservation       │
│ - Set status PARTIALLY_PAID │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│ Create Payment Record       │
│ - Generate payment ref      │
│ - Link to invoice           │
│ - Set status COMPLETED      │
│ - Create allocation         │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│ Update Invoice Status       │
│ - paidAmount = deposit      │
│ - remainingAmount = balance │
│ - Audit trail               │
└─────────────────────────────┘
```

### Reservation Conversion Flow

```
Reservation Converted to Order
         ↓
┌──────────────────────────────┐
│ Create Order Invoice         │
│ - Generate invoice number    │
│ - Link to order              │
│ - Snapshot order items       │
└─────────────┬────────────────┘
              ↓
┌──────────────────────────────┐
│ Transfer Financial History   │
│ - Move payments to order inv │
│ - Update allocations         │
│ - Cancel reservation invoice │
│ - Preserve audit trail       │
└──────────────────────────────┘
```

### Usage

#### 1. Creating Reservation with Deposit

```typescript
import { InvoiceIntegrationService } from './invoice-integration.service.js';

// When creating a reservation
const result = await invoiceIntegrationService.convertReservationDeposit({
  reservationId: reservation.id,
  customerId: reservation.customerId,
  branchId: reservation.branchId,
  userId: userId,
  totalPrice: reservation.totalPrice,
  depositAmount: reservation.paidAmount,
  motorcycleId: reservation.motorcycleId,
  motorcycleDescription: `${motorcycle.brand.nameEn} ${motorcycle.model}`,
  idempotencyKey: `res-deposit-${reservation.id}`,
  tx: transaction, // Optional: pass transaction for atomicity
});

// Result contains:
// - invoice: The created invoice
// - payment: The created payment record
// - isNew: false if already existed (idempotency)
```

#### 2. Converting Reservation to Order

```typescript
// Step 1: Create order invoice
const orderInvoice = await invoiceIntegrationService.generateInvoiceFromOrder({
  orderId: order.id,
  customerId: order.customerId,
  branchId: order.branchId,
  userId: userId,
  orderItems: order.items.map(item => ({
    motorcycleId: item.motorcycleId,
    description: `${item.motorcycle.brand.nameEn} ${item.motorcycle.model}`,
    unitPrice: item.unitPrice,
    discount: item.discount,
  })),
  totalAmount: order.totalAmount,
  discount: order.discount,
  netAmount: order.netAmount,
  notes: `Converted from reservation ${reservation.reservationNumber}`,
  tx: transaction,
});

// Step 2: Transfer reservation financial history
const updatedInvoice = await invoiceIntegrationService.transferReservationFinancialsToOrder({
  reservationId: reservation.id,
  orderId: order.id,
  userId: userId,
  tx: transaction,
});
```

### Idempotency Protection

**Duplicate Prevention**:
- Invoice creation checks for existing `reservationId`
- Payment creation uses unique `idempotencyKey`
- Returns existing records if already created

**Example Idempotency Key Pattern**:
```typescript
const idempotencyKey = `res-deposit-${reservationId}-${timestamp}`;
```

### Audit Trail

All operations are logged:

```typescript
// Invoice creation
{ action: 'create', entityType: 'invoice', entityId: invoiceId }

// Payment creation
{ action: 'create', entityType: 'payment', entityId: paymentId }

// Financial transfer
{ action: 'transfer', entityType: 'invoice', before: {...}, after: {...} }
```

### Error Handling

```typescript
try {
  await invoiceIntegrationService.convertReservationDeposit({...});
} catch (error) {
  if (error.code === 'INVOICE_ALREADY_EXISTS') {
    // Invoice already created, fetch existing
  }
  if (error.code === 'BRANCH_NOT_FOUND') {
    // Invalid branch
  }
  // Handle other errors
}
```

## TASK-010: Order Payment Integration

### Purpose

Automatically generate invoices from orders and maintain financial snapshots.

### Flow Diagram

```
Order Created/Confirmed
         ↓
┌─────────────────────────────┐
│ Generate Invoice from Order │
│ - Create invoice             │
│ - Snapshot order items       │
│ - Apply order discounts      │
│ - Set status ISSUED          │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│ Customer Makes Payment       │
│ - Record payment             │
│ - Allocate to invoice        │
│ - Update invoice status      │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│ Invoice Status Updates       │
│ ISSUED → PARTIALLY_PAID      │
│        → PAID                │
└─────────────────────────────┘
```

### Usage

#### Auto-Generate Invoice on Order Creation

```typescript
// In OrdersService.create() or OrdersController
const order = await ordersService.create({...});

// Generate invoice
const invoice = await invoiceIntegrationService.generateInvoiceFromOrder({
  orderId: order.id,
  customerId: order.customerId,
  branchId: order.branchId,
  userId: userId,
  orderItems: order.items.map(item => ({
    motorcycleId: item.motorcycleId,
    description: `${item.motorcycle.brand.nameEn} ${item.motorcycle.model} (${item.motorcycle.year})`,
    unitPrice: Number(item.unitPrice),
    discount: Number(item.discount),
  })),
  totalAmount: Number(order.totalAmount),
  discount: Number(order.discount),
  netAmount: Number(order.netAmount),
  notes: order.notes,
});
```

#### Financial Snapshot Preservation

The invoice captures a **historical financial snapshot** of the order at the time of invoice generation:

- **Order changes** (price updates, cancellations) don't affect the invoice
- **Invoice reflects** the agreed-upon price at time of sale
- **Motorcycle price changes** don't retroactively affect issued invoices

### One Invoice Per Order

**Constraint**: Each order can have only one invoice.

```typescript
// Check for existing invoice
const existingInvoice = await prisma.invoice.findFirst({
  where: { orderId },
});

if (existingInvoice) {
  return existingInvoice; // Return existing, don't create duplicate
}
```

### Order-Invoice Synchronization

The invoice status reflects payment progress but **does not update order status**:

| Invoice Status | Description | Order Status |
|---------------|-------------|--------------|
| `DRAFT` | Invoice being prepared | No change |
| `ISSUED` | Invoice sent to customer | No change |
| `PARTIALLY_PAID` | Partial payment received | No change |
| `PAID` | Fully paid | No change* |
| `CANCELLED` | Invoice cancelled | No change |

*Order status is managed independently by order business logic (delivery, fulfillment, etc.).

### POS Integration Boundary

For POS sales:
1. POS creates order (draft or confirmed)
2. Invoice auto-generated
3. Payment recorded through payment API
4. Invoice status updated
5. POS receives payment confirmation

**Important**: POS should **not** implement its own payment logic. All payments flow through the centralized payment API.

## Database Relationships

### Invoice Relations

```prisma
model Invoice {
  orderId         String?       @unique @db.Uuid
  reservationId   String?       @unique @db.Uuid
  
  order           Order?        @relation(...)
  reservation     Reservation?  @relation(...)
  payments        Payment[]
}
```

**Constraints**:
- One invoice per order (unique constraint)
- One invoice per reservation (unique constraint)
- Invoice can have either `orderId` OR `reservationId`, not both

### Payment Relations

```prisma
model Payment {
  invoiceId   String   @db.Uuid
  invoice     Invoice  @relation(...)
  allocations PaymentAllocation[]
}

model PaymentAllocation {
  paymentId String  @db.Uuid
  invoiceId String  @db.Uuid
  amount    Decimal @db.Decimal(12, 2)
}
```

## Testing Integration

### Test Scenarios

1. **Reservation with Deposit**
   - Create reservation with deposit
   - Verify invoice created
   - Verify payment record created
   - Verify invoice status PARTIALLY_PAID

2. **Reservation Conversion**
   - Create reservation with deposit
   - Convert to order
   - Verify order invoice created
   - Verify payments transferred
   - Verify reservation invoice cancelled

3. **Order Payment**
   - Create order
   - Verify invoice auto-generated
   - Record payment
   - Verify invoice status updates

4. **Idempotency**
   - Attempt duplicate deposit conversion
   - Verify returns existing records
   - Verify no duplicate payment created

### Integration Test Example

```typescript
describe('Reservation Deposit Integration', () => {
  it('should convert deposit to payment and transfer on order conversion', async () => {
    // 1. Create reservation with deposit
    const reservation = await reservationsService.create({
      customerId: customer.id,
      motorcycleId: motorcycle.id,
      depositAmount: 5000,
    });
    
    // 2. Convert deposit
    const depositResult = await invoiceIntegrationService.convertReservationDeposit({
      reservationId: reservation.id,
      depositAmount: 5000,
      ...
    });
    
    expect(depositResult.invoice).toBeDefined();
    expect(depositResult.payment).toBeDefined();
    
    // 3. Convert to order
    const order = await reservationsService.convert(reservation.id);
    
    // 4. Generate order invoice and transfer
    const orderInvoice = await invoiceIntegrationService.generateInvoiceFromOrder({
      orderId: order.id,
      ...
    });
    
    await invoiceIntegrationService.transferReservationFinancialsToOrder({
      reservationId: reservation.id,
      orderId: order.id,
    });
    
    // 5. Verify transfer
    const payments = await paymentsService.list({
      invoiceId: orderInvoice.id,
    });
    
    expect(payments.items).toHaveLength(1);
    expect(payments.items[0].amount).toBe(5000);
  });
});
```

## Security Considerations

1. **Branch Scoping**: All integration methods respect branch-level access control
2. **Authorization**: User permissions verified before invoice/payment creation
3. **Idempotency**: Duplicate operations prevented via keys and constraints
4. **Audit Trail**: All financial operations logged with full context
5. **Transaction Integrity**: Critical operations wrapped in database transactions

## Performance Considerations

1. **Indexes**: Proper indexes on `orderId`, `reservationId`, `invoiceId`
2. **Batch Operations**: Use transactions for multi-step operations
3. **Query Optimization**: Select only required fields
4. **Caching**: Consider caching invoice generation logic for POS

## Future Enhancements

- Support for multiple invoices per order (installments)
- Automatic invoice generation triggers (order status changes)
- Invoice templates and customization
- Email invoice delivery
- PDF invoice generation
- Multi-currency support

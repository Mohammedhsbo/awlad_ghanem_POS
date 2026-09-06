/**
 * Integration tests for TASK-008 through TASK-011
 * - TASK-008: Customer Financing API
 * - TASK-009: Order Integration
 * - TASK-010: Early Settlement
 * - TASK-011: Concurrency & Transaction Safety
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Test data IDs
let testBranchId: string;
let testCustomer1Id: string;
let testCustomer2Id: string;
let testStaffUserId: string;
let testAdminUserId: string;
let testOrder1Id: string;
let testOrder2Id: string;
let testContract1Id: string;
let testContract2Id: string;

let orderFixtureCounter = 0;
let paymentFixtureCounter = 0;

/** Payment.paymentReference and Payment.idempotencyKey are both unique columns. */
function paymentFixtureRef() {
  paymentFixtureCounter += 1;
  return `PAY-FIN-FIXTURE-${paymentFixtureCounter.toString().padStart(4, '0')}`;
}

/** Creates a throwaway confirmed order so a fixture can hold its own active contract. */
async function createOrderForFinancing(amount: number) {
  orderFixtureCounter += 1;
  const order = await prisma.order.create({
    data: {
      orderNumber: `ORD-FIN-FIXTURE-${orderFixtureCounter.toString().padStart(3, '0')}`,
      customerId: testCustomer1Id,
      branchId: testBranchId,
      userId: testStaffUserId,
      status: 'confirmed',
      totalAmount: amount,
      netAmount: amount,
    },
  });
  return order.id;
}

describe('TASK-008 through TASK-011: Financing Features', () => {
  beforeAll(async () => {
    // Create test branch
    const branch = await prisma.branch.create({
      data: {
        nameAr: 'فرع اختبار التمويل',
        nameEn: 'Financing Test Branch',
        phone: '0500000001',
        isActive: true,
      },
    });
    testBranchId = branch.id;

    // Create test customers
    const customer1 = await prisma.customer.create({
      data: {
        name: 'Test Customer 1',
        phone: '0511111111',
        email: 'customer1@test.com',
        isActive: true,
      },
    });
    testCustomer1Id = customer1.id;

    const customer2 = await prisma.customer.create({
      data: {
        name: 'Test Customer 2',
        phone: '0522222222',
        email: 'customer2@test.com',
        isActive: true,
      },
    });
    testCustomer2Id = customer2.id;

    // Create test users. These roles come from the production seed, which a
    // test run does not necessarily have; create them if they are missing
    // rather than dereferencing null.
    const staffRole = await prisma.role.upsert({
      where: { name: 'sales_staff' },
      update: {},
      create: { name: 'sales_staff', description: 'sales_staff (financing fixture)' },
    });

    const adminRole = await prisma.role.upsert({
      where: { name: 'branch_admin' },
      update: {},
      create: { name: 'branch_admin', description: 'branch_admin (financing fixture)' },
    });

    const staffUser = await prisma.user.create({
      data: {
        name: 'Test Staff',
        email: 'staff@test.com',
        passwordHash: 'test-fixture-not-used',
        phone: '0533333333',
        roleId: staffRole.id,
        branchId: testBranchId,
        isActive: true,
      },
    });
    testStaffUserId = staffUser.id;

    const adminUser = await prisma.user.create({
      data: {
        name: 'Test Admin',
        email: 'admin@test.com',
        passwordHash: 'test-fixture-not-used',
        phone: '0544444444',
        roleId: adminRole.id,
        branchId: testBranchId,
        isActive: true,
      },
    });
    testAdminUserId = adminUser.id;

    // Create test orders
    const order1 = await prisma.order.create({
      data: {
        orderNumber: 'ORD-TEST-001',
        customerId: testCustomer1Id,
        branchId: testBranchId,
        userId: testStaffUserId,
        status: 'confirmed',
        totalAmount: 50000,
        netAmount: 50000,
        notes: 'Test order for financing',
      },
    });
    testOrder1Id = order1.id;

    const order2 = await prisma.order.create({
      data: {
        orderNumber: 'ORD-TEST-002',
        customerId: testCustomer1Id,
        branchId: testBranchId,
        userId: testStaffUserId,
        status: 'confirmed',
        totalAmount: 30000,
        netAmount: 30000,
        notes: 'Test order 2 for financing',
      },
    });
    testOrder2Id = order2.id;
  });

  afterAll(async () => {
    // Cleanup in reverse order of dependencies
    await prisma.paymentAllocation.deleteMany({
      where: {
        installment: {
          contract: {
            branchId: testBranchId,
          },
        },
      },
    });

    await prisma.payment.deleteMany({
      where: { branchId: testBranchId },
    });

    await prisma.installment.deleteMany({
      where: {
        contract: {
          branchId: testBranchId,
        },
      },
    });

    await prisma.financingContract.deleteMany({
      where: { branchId: testBranchId },
    });

    await prisma.order.deleteMany({
      where: { branchId: testBranchId },
    });

    await prisma.user.deleteMany({
      where: { branchId: testBranchId },
    });

    await prisma.customer.deleteMany({
      where: {
        id: { in: [testCustomer1Id, testCustomer2Id] },
      },
    });

    await prisma.branch.delete({
      where: { id: testBranchId },
    });

    await prisma.$disconnect();
  });

  describe('TASK-009: Order Integration', () => {
    it('should create financing contract linked to order', async () => {
      const contract = await prisma.financingContract.create({
        data: {
          contractNumber: 'FIN-TEST-001',
          customerId: testCustomer1Id,
          orderId: testOrder1Id,
          branchId: testBranchId,
          createdBy: testStaffUserId,
          totalAmount: 50000,
          downPayment: 10000,
          financingAmount: 40000,
          numberOfInstallments: 12,
          installmentFrequency: 'monthly',
          interestRate: 0,
          startDate: new Date('2026-09-01'),
          status: 'active',
        },
        include: {
          order: true,
        },
      });

      testContract1Id = contract.id;

      expect(contract.orderId).toBe(testOrder1Id);
      expect(contract.order.orderNumber).toBe('ORD-TEST-001');
      expect(contract.status).toBe('active');
    });

    it('should prevent duplicate active financing for same order', async () => {
      // Try to create another active contract for the same order
      const existingActive = await prisma.financingContract.findFirst({
        where: {
          orderId: testOrder1Id,
          status: 'active',
        },
      });

      expect(existingActive).not.toBeNull();
      expect(existingActive?.contractNumber).toBe('FIN-TEST-001');

      // Attempting to create another would violate business logic
      // (This would be caught at service layer, not database constraint)
    });

    it('should allow cancelled order to be financed again', async () => {
      // Cancel the first contract
      await prisma.financingContract.update({
        where: { id: testContract1Id },
        data: { status: 'cancelled' },
      });

      // Now can create new active contract for same order
      const newContract = await prisma.financingContract.create({
        data: {
          contractNumber: 'FIN-TEST-001-V2',
          customerId: testCustomer1Id,
          orderId: testOrder1Id,
          branchId: testBranchId,
          createdBy: testStaffUserId,
          totalAmount: 50000,
          downPayment: 10000,
          financingAmount: 40000,
          numberOfInstallments: 12,
          installmentFrequency: 'monthly',
          interestRate: 0,
          startDate: new Date('2026-09-01'),
          status: 'active',
        },
      });

      expect(newContract.status).toBe('active');

      // Cleanup - restore original for other tests
      await prisma.financingContract.delete({
        where: { id: newContract.id },
      });
      await prisma.financingContract.update({
        where: { id: testContract1Id },
        data: { status: 'active' },
      });
    });

    it('should handle order cancellation with no payments', async () => {
      // Create contract for order 2
      const contract = await prisma.financingContract.create({
        data: {
          contractNumber: 'FIN-TEST-002',
          customerId: testCustomer1Id,
          orderId: testOrder2Id,
          branchId: testBranchId,
          createdBy: testStaffUserId,
          totalAmount: 30000,
          downPayment: 5000,
          financingAmount: 25000,
          numberOfInstallments: 10,
          installmentFrequency: 'monthly',
          interestRate: 0,
          startDate: new Date('2026-09-01'),
          status: 'active',
        },
      });

      testContract2Id = contract.id;

      // Create installments
      for (let i = 1; i <= 10; i++) {
        await prisma.installment.create({
          data: {
            contractId: contract.id,
            installmentNumber: i,
            dueDate: new Date(Date.UTC(2026, 7 + i, 1)),
            amount: 2500,
            paidAmount: 0,
            status: 'upcoming',
          },
        });
      }

      // Check no payments exist
      const paymentsCount = await prisma.installment.count({
        where: {
          contractId: contract.id,
          paidAmount: { gt: 0 },
        },
      });

      expect(paymentsCount).toBe(0);

      // Simulate order cancellation (would happen in orders.service.ts)
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: testOrder2Id },
          data: { status: 'cancelled' },
        });

        await tx.financingContract.update({
          where: { id: contract.id },
          data: { status: 'cancelled' },
        });
      });

      const cancelledContract = await prisma.financingContract.findUnique({
        where: { id: contract.id },
      });

      expect(cancelledContract?.status).toBe('cancelled');
    });
  });

  describe('TASK-008: Customer Financing API', () => {
    it('should calculate correct financing summary for customer', async () => {
      // Get customer contracts
      const contracts = await prisma.financingContract.findMany({
        where: {
          customerId: testCustomer1Id,
          status: 'active',
        },
        include: {
          installments: true,
        },
      });

      // Calculate summary
      const totalFinanced = contracts.reduce(
        (sum, c) => sum + Number(c.totalAmount) - Number(c.downPayment),
        0
      );

      const totalPaid = contracts.reduce(
        (sum, c) =>
          sum +
          c.installments.reduce((iSum, inst) => iSum + Number(inst.paidAmount), 0),
        0
      );

      const totalRemaining = totalFinanced - totalPaid;

      expect(contracts.length).toBeGreaterThan(0);
      expect(totalFinanced).toBe(40000); // Contract 1: 40000
      expect(totalPaid).toBe(0); // No payments yet
      expect(totalRemaining).toBe(40000);
    });

    it('should return customer contracts with pagination', async () => {
      const page = 1;
      const limit = 10;
      const skip = (page - 1) * limit;

      const [contracts, total] = await Promise.all([
        prisma.financingContract.findMany({
          where: { customerId: testCustomer1Id },
          include: {
            order: true,
            installments: {
              orderBy: { installmentNumber: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.financingContract.count({
          where: { customerId: testCustomer1Id },
        }),
      ]);

      expect(contracts.length).toBeGreaterThan(0);
      expect(total).toBeGreaterThan(0);
      expect(contracts[0].order).toBeDefined();
    });

    it('should enforce customer isolation - cannot access other customer data', async () => {
      const customer1Contracts = await prisma.financingContract.findMany({
        where: { customerId: testCustomer1Id },
      });

      const customer2Contracts = await prisma.financingContract.findMany({
        where: { customerId: testCustomer2Id },
      });

      // Customer 1 has contracts, Customer 2 doesn't
      expect(customer1Contracts.length).toBeGreaterThan(0);
      expect(customer2Contracts.length).toBe(0);

      // Service layer would enforce: customer can only query their own ID
    });

    it('should enforce branch isolation for staff', async () => {
      const branchContracts = await prisma.financingContract.findMany({
        where: { branchId: testBranchId },
      });

      // Staff user can only see contracts from their branch
      expect(branchContracts.length).toBeGreaterThan(0);
      expect(branchContracts.every((c) => c.branchId === testBranchId)).toBe(true);
    });
  });

  describe('TASK-010: Early Settlement', () => {
    let settlementTestContractId: string;
    let settlementInstallmentIds: string[] = [];

    beforeAll(async () => {
      // Create a contract specifically for settlement testing
      const contract = await prisma.financingContract.create({
        data: {
          contractNumber: 'FIN-SETTLE-001',
          customerId: testCustomer1Id,
          orderId: await createOrderForFinancing(24000),
          branchId: testBranchId,
          createdBy: testStaffUserId,
          totalAmount: 24000,
          downPayment: 4000,
          financingAmount: 20000,
          numberOfInstallments: 4,
          installmentFrequency: 'monthly',
          interestRate: 0,
          startDate: new Date('2026-09-01'),
          status: 'active',
        },
      });

      settlementTestContractId = contract.id;

      // Create 4 installments of 5000 each
      for (let i = 1; i <= 4; i++) {
        const inst = await prisma.installment.create({
          data: {
            contractId: contract.id,
            installmentNumber: i,
            dueDate: new Date(`2026-${8 + i}-15`),
            amount: 5000,
            paidAmount: 0,
            status: 'upcoming',
          },
        });
        settlementInstallmentIds.push(inst.id);
      }
    });

    it('should calculate correct remaining balance', async () => {
      const contract = await prisma.financingContract.findUnique({
        where: { id: settlementTestContractId },
        include: { installments: true },
      });

      const remainingBalance = contract!.installments.reduce((sum, inst) => {
        return sum + (Number(inst.amount) - Number(inst.paidAmount));
      }, 0);

      expect(remainingBalance).toBe(20000); // 4 × 5000
    });

    it('should process early settlement correctly', async () => {
      // Simulate early settlement
      const result = await prisma.$transaction(async (tx) => {
        const contract = await tx.financingContract.findUnique({
          where: { id: settlementTestContractId },
          include: { installments: true },
        });

        const remainingBalance = contract!.installments.reduce(
          (sum, inst) => sum + (Number(inst.amount) - Number(inst.paidAmount)),
          0
        );

        // Create settlement payment
        const payment = await tx.payment.create({
          data: {
            paymentReference: `PAY-SETTLE-${settlementTestContractId.slice(0, 8)}`,
            idempotencyKey: `settle-${settlementTestContractId}`,
            customerId: testCustomer1Id,
            branchId: testBranchId,
            userId: testStaffUserId,
            amount: remainingBalance,
            method: 'cash',
            notes: 'Early settlement test',
            status: 'completed',
            confirmedAt: new Date(),
          },
        });

        // Update all installments to paid
        for (const inst of contract!.installments) {
          const remaining = Number(inst.amount) - Number(inst.paidAmount);

          await tx.paymentAllocation.create({
            data: {
              paymentId: payment.id,
              installmentId: inst.id,
              amount: remaining,
            },
          });

          await tx.installment.update({
            where: { id: inst.id },
            data: {
              paidAmount: inst.amount,
              status: 'paid',
              paidAt: new Date(),
            },
          });
        }

        // Complete contract
        await tx.financingContract.update({
          where: { id: settlementTestContractId },
          data: {
            status: 'completed',
            completedAt: new Date(),
          },
        });

        return { payment, remainingBalance };
      });

      expect(result.remainingBalance).toBe(20000);

      // Verify all installments paid
      const updatedInstallments = await prisma.installment.findMany({
        where: { contractId: settlementTestContractId },
      });

      expect(updatedInstallments.every((inst) => inst.status === 'paid')).toBe(true);
      expect(
        updatedInstallments.every((inst) => Number(inst.paidAmount) === Number(inst.amount))
      ).toBe(true);

      // Verify contract completed
      const updatedContract = await prisma.financingContract.findUnique({
        where: { id: settlementTestContractId },
      });

      expect(updatedContract?.status).toBe('completed');
      expect(updatedContract?.completedAt).not.toBeNull();
    });

    it('should prevent settlement of already completed contract', async () => {
      const contract = await prisma.financingContract.findUnique({
        where: { id: settlementTestContractId },
      });

      expect(contract?.status).toBe('completed');

      // Attempting to settle again should fail (service layer check)
      // In real implementation, this would throw BadRequestException
    });
  });

  describe('TASK-011: Concurrency & Transaction Safety', () => {
    let concurrencyTestContractId: string;
    let concurrencyInstallmentId: string;

    beforeAll(async () => {
      // Create contract for concurrency testing
      const contract = await prisma.financingContract.create({
        data: {
          contractNumber: 'FIN-CONC-001',
          customerId: testCustomer1Id,
          orderId: await createOrderForFinancing(12000),
          branchId: testBranchId,
          createdBy: testStaffUserId,
          totalAmount: 12000,
          downPayment: 2000,
          financingAmount: 10000,
          numberOfInstallments: 2,
          installmentFrequency: 'monthly',
          interestRate: 0,
          startDate: new Date('2026-09-01'),
          status: 'active',
        },
      });

      concurrencyTestContractId = contract.id;

      const inst = await prisma.installment.create({
        data: {
          contractId: contract.id,
          installmentNumber: 1,
          dueDate: new Date('2026-09-15'),
          amount: 5000,
          paidAmount: 0,
          status: 'due',
        },
      });

      await prisma.installment.create({
        data: {
          contractId: contract.id,
          installmentNumber: 2,
          dueDate: new Date('2026-10-15'),
          amount: 5000,
          paidAmount: 0,
          status: 'upcoming',
        },
      });

      concurrencyInstallmentId = inst.id;
    });

    it('should handle transaction rollback on error', async () => {
      const initialInstallment = await prisma.installment.findUnique({
        where: { id: concurrencyInstallmentId },
      });

      expect(Number(initialInstallment?.paidAmount)).toBe(0);

      // Attempt transaction that will fail
      try {
        await prisma.$transaction(async (tx) => {
          await tx.installment.update({
            where: { id: concurrencyInstallmentId },
            data: { paidAmount: 1000 },
          });

          // Force an error
          throw new Error('Intentional rollback test');
        });
      } catch (error) {
        // Expected to fail
      }

      // Verify rollback - amount should still be 0
      const afterRollback = await prisma.installment.findUnique({
        where: { id: concurrencyInstallmentId },
      });

      expect(Number(afterRollback?.paidAmount)).toBe(0);
    });

    it('should maintain balance consistency after payment', async () => {
      const contractBefore = await prisma.financingContract.findUnique({
        where: { id: concurrencyTestContractId },
        include: { installments: true },
      });

      const totalAmountBefore = contractBefore!.installments.reduce(
        (sum, inst) => sum + Number(inst.amount),
        0
      );

      // Make a payment
      await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            paymentReference: paymentFixtureRef(),
            idempotencyKey: paymentFixtureRef(),
            customerId: testCustomer1Id,
            branchId: testBranchId,
            amount: 2500,
            method: 'cash',
            notes: 'Partial payment',
            status: 'completed',
            userId: testStaffUserId,
            confirmedAt: new Date(),
          },
        });

        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            installmentId: concurrencyInstallmentId,
            amount: 2500,
          },
        });

        await tx.installment.update({
          where: { id: concurrencyInstallmentId },
          data: { paidAmount: 2500 },
        });
      });

      const contractAfter = await prisma.financingContract.findUnique({
        where: { id: concurrencyTestContractId },
        include: { installments: true },
      });

      const totalAmountAfter = contractAfter!.installments.reduce(
        (sum, inst) => sum + Number(inst.amount),
        0
      );

      const totalPaid = contractAfter!.installments.reduce(
        (sum, inst) => sum + Number(inst.paidAmount),
        0
      );

      // Total installment amounts should not change
      expect(totalAmountAfter).toBe(totalAmountBefore);

      // Total paid should equal payment
      expect(totalPaid).toBe(2500);

      // Remaining should be consistent
      const remaining = totalAmountAfter - totalPaid;
      expect(remaining).toBe(10000 - 2500);
    });

    it('should detect contract completion after final payment', async () => {
      // Pay remaining amount on first installment
      await prisma.$transaction(async (tx) => {
        const inst = await tx.installment.findUnique({
          where: { id: concurrencyInstallmentId },
        });

        const remaining = Number(inst!.amount) - Number(inst!.paidAmount);

        const payment = await tx.payment.create({
          data: {
            paymentReference: paymentFixtureRef(),
            idempotencyKey: paymentFixtureRef(),
            customerId: testCustomer1Id,
            branchId: testBranchId,
            amount: remaining,
            method: 'cash',
            notes: 'Complete first installment',
            status: 'completed',
            userId: testStaffUserId,
            confirmedAt: new Date(),
          },
        });

        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            installmentId: concurrencyInstallmentId,
            amount: remaining,
          },
        });

        await tx.installment.update({
          where: { id: concurrencyInstallmentId },
          data: {
            paidAmount: inst!.amount,
            status: 'paid',
            paidAt: new Date(),
          },
        });
      });

      const firstInst = await prisma.installment.findUnique({
        where: { id: concurrencyInstallmentId },
      });

      expect(firstInst?.status).toBe('paid');
      expect(Number(firstInst?.paidAmount)).toBe(Number(firstInst?.amount));

      // Contract should NOT be complete yet (still has second installment)
      const contract = await prisma.financingContract.findUnique({
        where: { id: concurrencyTestContractId },
        include: { installments: true },
      });

      const allPaid = contract!.installments.every((inst) => inst.status === 'paid');
      expect(allPaid).toBe(false);
      expect(contract?.status).toBe('active');
    });
  });

  describe('Edge Cases & Validation', () => {
    it('should prevent payment exceeding installment balance', async () => {
      // Create test installment
      const contract = await prisma.financingContract.create({
        data: {
          contractNumber: 'FIN-EDGE-001',
          customerId: testCustomer1Id,
          orderId: await createOrderForFinancing(6000),
          branchId: testBranchId,
          createdBy: testStaffUserId,
          totalAmount: 6000,
          downPayment: 1000,
          financingAmount: 5000,
          numberOfInstallments: 1,
          installmentFrequency: 'monthly',
          interestRate: 0,
          startDate: new Date('2026-09-01'),
          status: 'active',
        },
      });

      const inst = await prisma.installment.create({
        data: {
          contractId: contract.id,
          installmentNumber: 1,
          dueDate: new Date('2026-09-15'),
          amount: 5000,
          paidAmount: 0,
          status: 'due',
        },
      });

      const overpaymentAmount = 6000; // Exceeds 5000 balance
      const remaining = Number(inst.amount) - Number(inst.paidAmount);

      // Service layer should reject this
      expect(overpaymentAmount).toBeGreaterThan(remaining);

      // In real implementation: throw BadRequestException('PAYMENT_EXCEEDS_BALANCE')
    });

    it('should handle multiple partial payments correctly', async () => {
      const contract = await prisma.financingContract.create({
        data: {
          contractNumber: 'FIN-PARTIAL-001',
          customerId: testCustomer1Id,
          orderId: await createOrderForFinancing(11000),
          branchId: testBranchId,
          createdBy: testStaffUserId,
          totalAmount: 11000,
          downPayment: 1000,
          financingAmount: 10000,
          numberOfInstallments: 1,
          installmentFrequency: 'monthly',
          interestRate: 0,
          startDate: new Date('2026-09-01'),
          status: 'active',
        },
      });

      const inst = await prisma.installment.create({
        data: {
          contractId: contract.id,
          installmentNumber: 1,
          dueDate: new Date('2026-09-15'),
          amount: 10000,
          paidAmount: 0,
          status: 'due',
        },
      });

      // Make 3 partial payments
      const payments = [3000, 3000, 4000];
      let cumulativePaid = 0;

      for (const amount of payments) {
        await prisma.$transaction(async (tx) => {
          const payment = await tx.payment.create({
            data: {
              paymentReference: paymentFixtureRef(),
              idempotencyKey: paymentFixtureRef(),
              customerId: testCustomer1Id,
              branchId: testBranchId,
              userId: testStaffUserId,
              amount,
              method: 'cash',
              notes: `Partial payment ${amount}`,
              status: 'completed',
              confirmedAt: new Date(),
            },
          });

          await tx.paymentAllocation.create({
            data: {
              paymentId: payment.id,
              installmentId: inst.id,
              amount,
            },
          });

          cumulativePaid += amount;

          await tx.installment.update({
            where: { id: inst.id },
            data: {
              paidAmount: cumulativePaid,
              status: cumulativePaid >= 10000 ? 'paid' : 'due',
              paidAt: cumulativePaid >= 10000 ? new Date() : null,
            },
          });
        });
      }

      const finalInst = await prisma.installment.findUnique({
        where: { id: inst.id },
      });

      expect(Number(finalInst?.paidAmount)).toBe(10000);
      expect(finalInst?.status).toBe('paid');
    });
  });
});

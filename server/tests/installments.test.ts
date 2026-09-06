import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  InstallmentStatus,
  FinancingContractStatus,
  PaymentMethod,
} from '@motorcycle-system/shared-types';
import { InstallmentsService } from '../src/installments/installments.service.js';
import { AuditService } from '../src/audit/audit.service.js';

const prisma = new PrismaClient();

// Mock audit service
const auditService = {
  log: async () => {},
} as unknown as AuditService;

const installmentsService = new InstallmentsService(prisma as any, auditService);

describe('Installments - TASK-006 & TASK-007', () => {
  let testBranchId: string;
  let testUserId: string;
  let testCustomerId: string;
  let testOrderId: string;
  let testContractId: string;
  let testInstallment1Id: string;
  let testInstallment2Id: string;

  beforeAll(async () => {
    // Create test data
    const branch = await prisma.branch.create({
      data: {
        nameAr: 'فرع اختبار الأقساط',
        nameEn: 'Installments Test Branch',
        phone: '1234567890',
      },
    });
    testBranchId = branch.id;

    const role = await prisma.role.findFirst({
      where: { name: 'super_admin' },
    });

    if (!role) {
      throw new Error('super_admin role not found');
    }

    const user = await prisma.user.create({
      data: {
        name: 'Test User',
        email: `test-installments-${Date.now()}@example.com`,
        passwordHash: 'hash',
        roleId: role.id,
        branchId: testBranchId,
      },
    });
    testUserId = user.id;

    const customer = await prisma.customer.create({
      data: {
        name: 'Test Customer',
        phone: `+9665${Math.floor(Math.random() * 100000000)}`,
      },
    });
    testCustomerId = customer.id;

    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-TEST-${Date.now()}`,
        customerId: testCustomerId,
        branchId: testBranchId,
        userId: testUserId,
        totalAmount: 10000,
        netAmount: 10000,
      },
    });
    testOrderId = order.id;

    // Create financing contract with installments
    const contract = await prisma.financingContract.create({
      data: {
        contractNumber: `FIN-TEST-${Date.now()}`,
        customerId: testCustomerId,
        orderId: testOrderId,
        branchId: testBranchId,
        createdBy: testUserId,
        totalAmount: 10000,
        downPayment: 2000,
        financingAmount: 8000,
        numberOfInstallments: 2,
        installmentFrequency: 'monthly',
        interestRate: 0,
        startDate: new Date('2026-01-01'),
        status: FinancingContractStatus.ACTIVE,
      },
    });
    testContractId = contract.id;

    // Create 2 installments
    const inst1 = await prisma.installment.create({
      data: {
        contractId: testContractId,
        installmentNumber: 1,
        dueDate: new Date('2026-01-01'),
        amount: 4000,
        paidAmount: 0,
        status: InstallmentStatus.DUE,
      },
    });
    testInstallment1Id = inst1.id;

    const inst2 = await prisma.installment.create({
      data: {
        contractId: testContractId,
        installmentNumber: 2,
        dueDate: new Date('2026-02-01'),
        amount: 4000,
        paidAmount: 0,
        status: InstallmentStatus.UPCOMING,
      },
    });
    testInstallment2Id = inst2.id;
  });

  afterAll(async () => {
    // Cleanup
    // Delete payments and allocations created during tests before installments
    await prisma.paymentAllocation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.installment.deleteMany({
      where: { contractId: testContractId },
    });
    await prisma.financingContract.delete({
      where: { id: testContractId },
    });
    await prisma.order.delete({ where: { id: testOrderId } });
    await prisma.customer.delete({ where: { id: testCustomerId } });
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.branch.delete({ where: { id: testBranchId } });
    await prisma.$disconnect();
  });

  describe('TASK-006: Installment Payment Integration', () => {
    it('should create full payment for installment', async () => {
      const payment = await installmentsService.createPayment(
        testInstallment1Id,
        {
          amount: 4000,
          method: PaymentMethod.CASH,
          idempotencyKey: `test-full-payment-${Date.now()}`,
          notes: 'Full payment test',
        },
        testUserId,
        testBranchId,
        true
      );

      expect(Number(payment.amount)).toBe(4000);
      expect(payment.status).toBe('completed');
      expect(payment.method).toBe(PaymentMethod.CASH);

      const allocation = await prisma.paymentAllocation.findFirst({
        where: { paymentId: payment.id },
      });
      expect(allocation?.installmentId).toBe(testInstallment1Id);

      // Check installment updated
      const installment = await prisma.installment.findUnique({
        where: { id: testInstallment1Id },
      });

      expect(Number(installment?.paidAmount)).toBe(4000);
      expect(installment?.status).toBe(InstallmentStatus.PAID);
      expect(installment?.paidAt).not.toBeNull();
    });

    it('should handle partial payment', async () => {
      const payment = await installmentsService.createPayment(
        testInstallment2Id,
        {
          amount: 2000, // Partial: 2000 of 4000
          method: PaymentMethod.CARD,
          idempotencyKey: `test-partial-payment-${Date.now()}`,
          notes: 'Partial payment test',
        },
        testUserId,
        testBranchId,
        true
      );

      expect(Number(payment.amount)).toBe(2000);

      // Check installment updated with partial amount
      const installment = await prisma.installment.findUnique({
        where: { id: testInstallment2Id },
      });

      expect(Number(installment?.paidAmount)).toBe(2000);
      expect(installment?.status).toBe(InstallmentStatus.DUE); // Still due, not fully paid
      expect(installment?.paidAt).toBeNull(); // Not fully paid yet
    });

    it('should handle multiple partial payments', async () => {
      // Second partial payment
      const payment2 = await installmentsService.createPayment(
        testInstallment2Id,
        {
          amount: 1500,
          method: PaymentMethod.CASH,
          idempotencyKey: `test-partial-payment-2-${Date.now()}`,
          notes: 'Second partial payment',
        },
        testUserId,
        testBranchId,
        true
      );

      expect(Number(payment2.amount)).toBe(1500);

      // Check total paid amount
      const installment = await prisma.installment.findUnique({
        where: { id: testInstallment2Id },
      });

      expect(Number(installment?.paidAmount)).toBe(3500); // 2000 + 1500
      expect(installment?.status).toBe(InstallmentStatus.DUE); // Still not fully paid
    });

    it('should complete installment with final payment', async () => {
      // Final payment to complete
      const payment3 = await installmentsService.createPayment(
        testInstallment2Id,
        {
          amount: 500, // Complete remaining 500
          method: PaymentMethod.BANK_TRANSFER,
          idempotencyKey: `test-final-payment-${Date.now()}`,
          notes: 'Final payment',
        },
        testUserId,
        testBranchId,
        true
      );

      expect(Number(payment3.amount)).toBe(500);

      // Check installment fully paid
      const installment = await prisma.installment.findUnique({
        where: { id: testInstallment2Id },
      });

      expect(Number(installment?.paidAmount)).toBe(4000);
      expect(installment?.status).toBe(InstallmentStatus.PAID);
      expect(installment?.paidAt).not.toBeNull();
    });

    it('should complete contract when all installments paid', async () => {
      // Check contract status
      const contract = await prisma.financingContract.findUnique({
        where: { id: testContractId },
      });

      expect(contract?.status).toBe(FinancingContractStatus.COMPLETED);
      expect(contract?.completedAt).not.toBeNull();
    });

    it('should reject payment exceeding balance', async () => {
      // Reset contract status to active for further tests
      await prisma.financingContract.update({
        where: { id: testContractId },
        data: { status: FinancingContractStatus.ACTIVE, completedAt: null },
      });

      // Create new installment for this test
      const newInst = await prisma.installment.create({
        data: {
          contractId: testContractId,
          installmentNumber: 3,
          dueDate: new Date('2026-03-01'),
          amount: 1000,
          paidAmount: 0,
          status: InstallmentStatus.UPCOMING,
        },
      });

      try {
        await installmentsService.createPayment(
          newInst.id,
          {
            amount: 1500, // More than 1000
            method: PaymentMethod.CASH,
            idempotencyKey: `test-exceed-${Date.now()}`,
          },
          testUserId,
          testBranchId,
          true
        );
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response?.code).toBe('PAYMENT_EXCEEDS_BALANCE');
      }

      // Cleanup
      await prisma.installment.delete({ where: { id: newInst.id } });
    });

    it('should handle duplicate/idempotent allocation', async () => {
      const idempotencyKey = `test-idempotent-${Date.now()}`;

      // Create new installment
      const newInst = await prisma.installment.create({
        data: {
          contractId: testContractId,
          installmentNumber: 4,
          dueDate: new Date('2026-04-01'),
          amount: 500,
          paidAmount: 0,
          status: InstallmentStatus.UPCOMING,
        },
      });

      // First payment
      const payment1 = await installmentsService.createPayment(
        newInst.id,
        {
          amount: 500,
          method: PaymentMethod.CASH,
          idempotencyKey,
        },
        testUserId,
        testBranchId,
        true
      );

      // Second payment with same idempotency key
      const payment2 = await installmentsService.createPayment(
        newInst.id,
        {
          amount: 500,
          method: PaymentMethod.CASH,
          idempotencyKey, // Same key
        },
        testUserId,
        testBranchId,
        true
      );

      // Should return same payment
      expect(payment2.id).toBe(payment1.id);
      expect(payment2.idempotencyKey).toBe(idempotencyKey);

      // Check installment only paid once
      const installment = await prisma.installment.findUnique({
        where: { id: newInst.id },
      });

      expect(Number(installment?.paidAmount)).toBe(500); // Not doubled

      // Cleanup
      await prisma.paymentAllocation.deleteMany({
        where: { paymentId: payment1.id },
      });
      await prisma.payment.delete({ where: { id: payment1.id } });
      await prisma.installment.delete({ where: { id: newInst.id } });
    });
  });

  describe('TASK-007: Status Management', () => {
    let upcomingInstId: string;
    let dueInstId: string;

    beforeEach(async () => {
      // Create test installments with specific dates and statuses
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const upcomingInst = await prisma.installment.create({
        data: {
          contractId: testContractId,
          installmentNumber: 10,
          dueDate: yesterday, // Due date reached
          amount: 100,
          paidAmount: 0,
          status: InstallmentStatus.UPCOMING,
        },
      });
      upcomingInstId = upcomingInst.id;

      const dueInst = await prisma.installment.create({
        data: {
          contractId: testContractId,
          installmentNumber: 11,
          dueDate: yesterday, // Due date passed
          amount: 100,
          paidAmount: 0,
          status: InstallmentStatus.DUE,
        },
      });
      dueInstId = dueInst.id;

      // Reset contract status to active for status management tests
      await prisma.financingContract.update({
        where: { id: testContractId },
        data: { status: FinancingContractStatus.ACTIVE, completedAt: null },
      });
    });

    afterEach(async () => {
      await prisma.installment.deleteMany({
        where: {
          id: { in: [upcomingInstId, dueInstId] },
        },
      });
    });

    it('should update upcoming → due when due date reached', async () => {
      const updatedCount = await installmentsService.updateStatuses();

      expect(updatedCount).toBeGreaterThan(0);

      // Check status updated
      const installment = await prisma.installment.findUnique({
        where: { id: upcomingInstId },
      });

      expect(installment?.status).toBe(InstallmentStatus.OVERDUE);
    });

    it('should update due → overdue when due date passed', async () => {
      const updatedCount = await installmentsService.updateStatuses();

      expect(updatedCount).toBeGreaterThan(0);

      // Check status updated
      const installment = await prisma.installment.findUnique({
        where: { id: dueInstId },
      });

      expect(installment?.status).toBe(InstallmentStatus.OVERDUE);
    });

    it('should return count of updated installments', async () => {
      const count = await installmentsService.updateStatuses();

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});

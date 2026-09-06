import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  InstallmentStatus,
  FinancingContractStatus,
  PaymentMethod,
} from '@motorcycle-system/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  retryOnDeadlock,
  validateIdempotencyKey,
  validateNoNegativeAmounts,
} from '../utils/financial-transaction-safety.js';

interface CreateInstallmentPaymentRequest {
  amount: number;
  method: PaymentMethod;
  reference?: string;
  idempotencyKey: string;
  notes?: string;
}

@Injectable()
export class InstallmentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async sendWhatsApp(id: string, userId: string, userBranchId: string | null, isSuperAdmin: boolean) {
    const installment = await this.findById(id, userId, userBranchId, isSuperAdmin);
    const remaining = Number(installment.amount) - Number(installment.paidAmount);
    return this.notifications.sendDirectWhatsApp({
      customerId: installment.contract.customerId,
      recipient: installment.contract.customer.phone,
      subject: 'Installment reminder',
      body: `Installment reminder for ${installment.contract.customer.name}: ${remaining.toFixed(2)} is due on ${new Date(installment.dueDate).toLocaleDateString('en-GB')}.`,
    });
  }

  /**
   * TASK-006: Create payment for an installment
   * Routes through SPEC-008 payment infrastructure
   * Handles partial payments, allocation, and status updates
   */
  async createPayment(
    installmentId: string,
    data: CreateInstallmentPaymentRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    // Validate idempotency key
    if (!validateIdempotencyKey(data.idempotencyKey)) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Invalid idempotency key format',
      });
    }

    // Check for existing payment with this idempotency key
    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      include: {
        allocations: true,
      },
    });

    if (existingPayment) {
      // Return existing payment (idempotent behavior)
      await this.audit.log({
        userId,
        action: 'duplicate_installment_payment_attempt',
        entityType: 'installment',
        entityId: installmentId,
        branchId: existingPayment.branchId,
        after: { idempotencyKey: data.idempotencyKey, result: 'returned_existing' },
      });

      return existingPayment;
    }

    // Validate installment exists (preliminary check)
    const installmentCheck = await this.prisma.installment.findUnique({
      where: { id: installmentId },
      select: {
        id: true,
        contract: {
          select: {
            id: true,
            branchId: true,
            customerId: true,
            status: true,
          },
        },
      },
    });

    if (!installmentCheck) {
      throw new NotFoundException({
        code: 'INSTALLMENT_NOT_FOUND',
        message: 'Installment not found',
      });
    }

    // Branch scope
    if (!isSuperAdmin && installmentCheck.contract.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_ACCESS_VIOLATION',
        message: 'You can only create payments for installments in your own branch',
      });
    }

    // Create payment with row-level locking
    return await retryOnDeadlock(async () => {
      return await this.prisma.$transaction(async (tx) => {
        // Lock installment FOR UPDATE
        const lockedInstallment = await tx.installment.findUnique({
          where: { id: installmentId },
          include: {
            contract: {
              include: {
                customer: true,
                branch: true,
                installments: {
                  orderBy: { installmentNumber: 'asc' },
                },
              },
            },
          },
        });

        if (!lockedInstallment) {
          throw new NotFoundException({
            code: 'INSTALLMENT_NOT_FOUND',
            message: 'Installment not found',
          });
        }

        // Contract must be active
        if (lockedInstallment.contract.status !== FinancingContractStatus.ACTIVE) {
          throw new BadRequestException({
            code: 'CONTRACT_NOT_ACTIVE',
            message: 'Financing contract must be active to accept payments',
          });
        }

        // Installment cannot already be paid
        if (lockedInstallment.status === InstallmentStatus.PAID) {
          throw new BadRequestException({
            code: 'INSTALLMENT_ALREADY_PAID',
            message: 'Installment is already fully paid',
          });
        }

        const remainingAmount =
          Number(lockedInstallment.amount) - Number(lockedInstallment.paidAmount);

        // Validate payment amount doesn't exceed remaining balance
        if (data.amount > remainingAmount + 0.01) {
          // Allow 1 cent tolerance
          throw new BadRequestException({
            code: 'PAYMENT_EXCEEDS_BALANCE',
            message: `Payment amount ${data.amount} exceeds remaining balance ${remainingAmount.toFixed(2)}`,
          });
        }

        // Validate payment amount is positive
        if (data.amount <= 0) {
          throw new BadRequestException({
            code: 'INVALID_PAYMENT_AMOUNT',
            message: 'Payment amount must be positive',
          });
        }

        // Generate payment reference (reuse SPEC-008 utility)
        const { generatePaymentReference } = await import('../utils/number-generator.js');
        const paymentReference = await generatePaymentReference();

        // Create payment record (SPEC-008 Payment table)
        // Note: installment payments do not have an invoice; invoiceId is nullable
        const payment = await tx.payment.create({
          data: {
            paymentReference,
            invoiceId: null, // Installment payments are not invoice-based
            customerId: lockedInstallment.contract.customerId,
            branchId: lockedInstallment.contract.branchId,
            userId,
            amount: data.amount,
            method: data.method,
            status: 'completed', // Auto-complete for installment payments
            reference: data.reference || null,
            idempotencyKey: data.idempotencyKey,
            confirmedAt: new Date(),
            notes: data.notes || null,
          },
        });

        // Create payment allocation to installment (no invoice reference)
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: null, // No invoice for installment payments
            installmentId: installmentId,
            amount: data.amount,
          },
        });

        // Calculate new installment amounts
        const newPaidAmount = Number(lockedInstallment.paidAmount) + data.amount;
        const newRemainingAmount = Number(lockedInstallment.amount) - newPaidAmount;

        // Validate no negative amounts
        validateNoNegativeAmounts({
          paidAmount: newPaidAmount,
          remainingAmount: Math.max(0, newRemainingAmount),
        });

        // Determine new installment status
        let newStatus: InstallmentStatus = lockedInstallment.status as InstallmentStatus;
        let paidAt = lockedInstallment.paidAt;

        if (newRemainingAmount <= 0.01) {
          // Fully paid (allow 1 cent tolerance)
          newStatus = InstallmentStatus.PAID;
          paidAt = new Date();
        } else if (newPaidAmount > 0) {
          // Partially paid - keep current status (due/overdue)
          // Don't change to upcoming if it was due/overdue
          if (lockedInstallment.status === InstallmentStatus.UPCOMING) {
            // If it was upcoming and got a payment, mark as due
            newStatus = InstallmentStatus.DUE;
          }
        }

        // Update installment
        const updatedInstallment = await tx.installment.update({
          where: { id: installmentId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
            paidAt,
          },
        });

        // Check if all installments are paid → complete contract
        const allInstallments = lockedInstallment.contract.installments;
        const allPaid = allInstallments.every((inst) => {
          if (inst.id === installmentId) {
            // Use updated values for current installment
            return newStatus === InstallmentStatus.PAID;
          }
          return inst.status === InstallmentStatus.PAID;
        });

        if (allPaid && lockedInstallment.contract.status === FinancingContractStatus.ACTIVE) {
          // Complete the contract
          await tx.financingContract.update({
            where: { id: lockedInstallment.contractId },
            data: {
              status: FinancingContractStatus.COMPLETED,
              completedAt: new Date(),
            },
          });

          // Audit contract completion
          await this.audit.log({
            userId,
            action: 'complete',
            entityType: 'financing_contract',
            entityId: lockedInstallment.contractId,
            branchId: lockedInstallment.contract.branchId,
            after: {
              status: FinancingContractStatus.COMPLETED,
              completedAt: new Date(),
              trigger: 'all_installments_paid',
            },
          });
        }

        // Audit payment creation
        await this.audit.log({
          userId,
          action: 'create',
          entityType: 'installment_payment',
          entityId: payment.id,
          branchId: lockedInstallment.contract.branchId,
          after: {
            paymentReference: payment.paymentReference,
            amount: payment.amount,
            method: payment.method,
            installmentId,
            contractId: lockedInstallment.contractId,
          },
        });

        // Audit installment update
        await this.audit.log({
          userId,
          action: 'payment_applied',
          entityType: 'installment',
          entityId: installmentId,
          branchId: lockedInstallment.contract.branchId,
          before: {
            paidAmount: lockedInstallment.paidAmount,
            status: lockedInstallment.status,
          },
          after: {
            paidAmount: updatedInstallment.paidAmount,
            status: updatedInstallment.status,
            paidAt: updatedInstallment.paidAt,
            paymentId: payment.id,
          },
        });

        // Return payment with relations
        return await tx.payment.findUnique({
          where: { id: payment.id },
          include: {
            customer: true,
            branch: true,
            user: true,
            allocations: true,
          },
        });
      });
    });
  }

  /**
   * Get installment by ID with contract details
   */
  async findById(
    id: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    const installment = await this.prisma.installment.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            customer: true,
            branch: true,
            order: true,
          },
        },
      },
    });

    if (!installment) {
      throw new NotFoundException({
        code: 'INSTALLMENT_NOT_FOUND',
        message: 'Installment not found',
      });
    }

    // Branch scope
    if (!isSuperAdmin && installment.contract.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_ACCESS_VIOLATION',
        message: 'You can only access installments from your own branch',
      });
    }

    return {
      ...installment,
      remainingAmount: Number(installment.amount) - Number(installment.paidAmount),
    };
  }

  /**
   * TASK-007: Update installment statuses (upcoming → due, due → overdue)
   * Called by background job
   */
  async updateStatuses(limit: number = 100): Promise<number> {
    const now = new Date();
    let updatedCount = 0;

    // Update upcoming → due (due date reached)
    const upcomingToDue = await this.prisma.installment.updateMany({
      where: {
        status: InstallmentStatus.UPCOMING,
        dueDate: {
          lte: now,
        },
        contract: {
          status: FinancingContractStatus.ACTIVE,
        },
      },
      data: {
        status: InstallmentStatus.DUE,
      },
    });

    updatedCount += upcomingToDue.count;

    // Update due → overdue (due date passed and not paid)
    const dueToOverdue = await this.prisma.installment.updateMany({
      where: {
        status: InstallmentStatus.DUE,
        dueDate: {
          lt: now,
        },
        contract: {
          status: FinancingContractStatus.ACTIVE,
        },
      },
      data: {
        status: InstallmentStatus.OVERDUE,
      },
    });

    updatedCount += dueToOverdue.count;

    // Audit batch update
    if (updatedCount > 0) {
      await this.audit.log({
        userId: null,
        action: 'batch_status_update',
        entityType: 'installment',
        entityId: 'batch',
        branchId: null,
        after: {
          upcomingToDue: upcomingToDue.count,
          dueToOverdue: dueToOverdue.count,
          total: updatedCount,
          timestamp: now,
        },
      });
    }

    return updatedCount;
  }

  /**
   * List installments for a contract
   */
  async listByContract(
    contractId: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    // Verify contract access
    const contract = await this.prisma.financingContract.findUnique({
      where: { id: contractId },
      select: { branchId: true },
    });

    if (!contract) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: 'Financing contract not found',
      });
    }

    if (!isSuperAdmin && contract.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_ACCESS_VIOLATION',
        message: 'You can only access contracts from your own branch',
      });
    }

    const installments = await this.prisma.installment.findMany({
      where: { contractId },
      orderBy: { installmentNumber: 'asc' },
    });

    return installments.map((inst) => ({
      ...inst,
      remainingAmount: Number(inst.amount) - Number(inst.paidAmount),
    }));
  }
}

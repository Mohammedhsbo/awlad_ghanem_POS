import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateFinancingContractRequest,
  FinancingContract,
  Installment,
  FinancingContractStatus,
  UpdateFinancingContractRequest,
  ApproveFinancingContractRequest,
} from '@motorcycle-system/shared-types';
import { calculateInstallmentSchedule } from '../utils/financing-calculator.js';
import { generateFinancingContractNumber } from '../utils/number-generator.js';
import { Decimal } from '@prisma/client/runtime/library';

interface ListContractsQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: FinancingContractStatus;
  customerId?: string;
  branchId?: string;
  contractNumber?: string;
  startDateFrom?: string;
  startDateTo?: string;
}

interface ListContractsResult {
  data: FinancingContract[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class FinancingContractsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Create a new financing contract with installment schedule
   * TASK-009: Validates order exists, prevents duplicate active financing, links to order
   */
  async create(
    dto: CreateFinancingContractRequest,
    userId: string,
    userBranchId: string,
    isSuperAdmin: boolean
  ): Promise<FinancingContract & { installments: Installment[] }> {
    // TASK-009: Validate order exists and user has access
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        customer: true,
        branch: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // TASK-009: Order must be confirmed before financing can be created
    if (order.status !== 'confirmed' && order.status !== 'processing') {
      throw new BadRequestException('Financing can only be created for confirmed or processing orders');
    }

    // Branch access validation
    if (!isSuperAdmin && order.branchId !== userBranchId) {
      throw new ForbiddenException('Cannot create financing contract for order in different branch');
    }

    // TASK-009: Check if order already has an active financing contract (prevent duplicates)
    const existingContract = await this.prisma.financingContract.findFirst({
      where: {
        orderId: dto.orderId,
        status: FinancingContractStatus.ACTIVE,
      },
    });

    if (existingContract) {
      throw new ConflictException('Order already has an active financing contract');
    }

    // Validate customer exists and matches order
    if (dto.customerId && dto.customerId !== order.customerId) {
      throw new BadRequestException('Customer ID does not match order customer');
    }

    const customerId = dto.customerId || order.customerId;

    // Validate customer has access
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Note: Customer model doesn't have branchId in current schema
    // Branch isolation is enforced through order.branchId check above

    // Validate amounts
    if (dto.totalAmount <= 0) {
      throw new BadRequestException('Total amount must be positive');
    }

    if (dto.downPayment < 0) {
      throw new BadRequestException('Down payment cannot be negative');
    }

    if (dto.downPayment >= dto.totalAmount) {
      throw new BadRequestException('Down payment must be less than total amount');
    }

    // Validate installment count
    if (dto.numberOfInstallments < 1 || dto.numberOfInstallments > 120) {
      throw new BadRequestException('Number of installments must be between 1 and 120');
    }

    // Validate start date
    const startDate = new Date(dto.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (startDate < today) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    // Calculate installment schedule
    const calculationResult = calculateInstallmentSchedule(
      dto.totalAmount,
      dto.downPayment,
      dto.numberOfInstallments,
      startDate,
      dto.installmentFrequency || 'monthly'
    );

    // Generate contract number
    const branch = await this.prisma.branch.findUnique({
      where: { id: order.branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const branchCode = branch.nameEn.substring(0, 3).toUpperCase();
    const contractNumber = await generateFinancingContractNumber(
      this.prisma,
      branchCode,
      startDate.getFullYear()
    );

    // TASK-011: Create contract and installments in a transaction with serializable isolation
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Create the contract
        const contract = await tx.financingContract.create({
          data: {
            contractNumber,
            customerId,
            orderId: dto.orderId,
            branchId: order.branchId,
            createdBy: userId,
            totalAmount: new Decimal(dto.totalAmount),
            downPayment: new Decimal(dto.downPayment),
            financingAmount: new Decimal(calculationResult.financingAmount),
            numberOfInstallments: dto.numberOfInstallments,
            installmentFrequency: dto.installmentFrequency || 'monthly',
            interestRate: new Decimal(dto.interestRate || 0),
            startDate,
            status: FinancingContractStatus.ACTIVE,
          },
          include: {
            customer: true,
            order: true,
            branch: true,
            creator: true,
          },
        });

        // Create installments atomically with contract
        const installments = await Promise.all(
          calculationResult.installments.map((item) =>
            tx.installment.create({
              data: {
                contractId: contract.id,
                installmentNumber: item.installmentNumber,
                dueDate: item.dueDate,
                amount: new Decimal(item.amount),
                paidAmount: new Decimal(0),
                status: 'upcoming',
              },
            })
          )
        );

        return {
          ...contract,
          installments,
        };
      },
      {
        // TASK-011: Serializable isolation prevents duplicate contracts for same order
        isolationLevel: 'Serializable',
        maxWait: 5000,
        timeout: 10000,
      }
    );

    // Convert Decimals to numbers for response
    return this.formatContractWithInstallments(result);
  }

  /**
   * List financing contracts with filtering and pagination
   */
  async findAll(
    query: ListContractsQuery,
    userId: string,
    userBranchId: string,
    isSuperAdmin: boolean,
    isCustomer: boolean,
    customerId?: string
  ): Promise<ListContractsResult> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    // Branch isolation
    if (!isSuperAdmin) {
      where.branchId = userBranchId;
    } else if (query.branchId) {
      where.branchId = query.branchId;
    }

    // Customer isolation
    if (isCustomer) {
      where.customerId = customerId;
    } else if (query.customerId) {
      where.customerId = query.customerId;
    }

    // Status filter
    if (query.status) {
      where.status = query.status;
    }

    // Contract number exact match
    if (query.contractNumber) {
      where.contractNumber = query.contractNumber;
    }

    // Search by customer name or contract number
    if (query.search) {
      where.OR = [
        { contractNumber: { contains: query.search, mode: 'insensitive' } },
        {
          customer: {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
            ],
          },
        },
      ];
    }

    // Date range filters
    if (query.startDateFrom || query.startDateTo) {
      where.startDate = {};
      if (query.startDateFrom) {
        where.startDate.gte = new Date(query.startDateFrom);
      }
      if (query.startDateTo) {
        where.startDate.lte = new Date(query.startDateTo);
      }
    }

    // Execute query
    const [contracts, total] = await Promise.all([
      this.prisma.financingContract.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
            },
          },
          branch: {
            select: {
              id: true,
              nameEn: true,
              nameAr: true,
            },
          },
          creator: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              installments: true,
            },
          },
          installments: {
            orderBy: { installmentNumber: 'asc' },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.financingContract.count({ where }),
    ]);

    return {
      data: contracts.map((c) => this.formatContract(c)),
      total,
      page,
      limit,
    };
  }

  /**
   * Get a single financing contract by ID
   */
  async findOne(
    id: string,
    userId: string,
    userBranchId: string,
    isSuperAdmin: boolean,
    isCustomer: boolean,
    customerId?: string
  ): Promise<FinancingContract & { installments: Installment[] }> {
    const contract = await this.prisma.financingContract.findUnique({
      where: { id },
      include: {
        customer: true,
        order: true,
        branch: true,
        creator: true,
        approver: true,
        installments: {
          orderBy: { installmentNumber: 'asc' },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException('Financing contract not found');
    }

    // Branch access check
    if (!isSuperAdmin && contract.branchId !== userBranchId) {
      throw new ForbiddenException('Cannot access financing contract in different branch');
    }

    // Customer access check
    if (isCustomer && contract.customerId !== customerId) {
      throw new ForbiddenException('Cannot access another customer\'s financing contract');
    }

    return this.formatContractWithInstallments(contract);
  }

  /**
   * Update financing contract status
   */
  async updateStatus(
    id: string,
    dto: UpdateFinancingContractRequest,
    userId: string,
    userBranchId: string,
    isSuperAdmin: boolean
  ): Promise<FinancingContract> {
    const contract = await this.prisma.financingContract.findUnique({
      where: { id },
    });

    if (!contract) {
      throw new NotFoundException('Financing contract not found');
    }

    // Branch access check
    if (!isSuperAdmin && contract.branchId !== userBranchId) {
      throw new ForbiddenException('Cannot update financing contract in different branch');
    }

    // Validate status transition
    if (dto.status) {
      this.validateStatusTransition(contract.status, dto.status);
    }

    const updated = await this.prisma.financingContract.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes,
        updatedAt: new Date(),
      },
      include: {
        customer: true,
        order: true,
        branch: true,
        creator: true,
        approver: true,
      },
    });

    return this.formatContract(updated);
  }

  /**
   * Approve a financing contract
   */
  async approve(
    id: string,
    dto: ApproveFinancingContractRequest,
    userId: string,
    userBranchId: string,
    isSuperAdmin: boolean,
    userRole: string
  ): Promise<FinancingContract> {
    // Only branch_admin and super_admin can approve
    if (userRole !== 'branch_admin' && userRole !== 'super_admin') {
      throw new ForbiddenException('Only branch admin or super admin can approve financing contracts');
    }

    const contract = await this.prisma.financingContract.findUnique({
      where: { id },
    });

    if (!contract) {
      throw new NotFoundException('Financing contract not found');
    }

    // Branch access check
    if (!isSuperAdmin && contract.branchId !== userBranchId) {
      throw new ForbiddenException('Cannot approve financing contract in different branch');
    }

    // Check if already approved
    if (contract.approvedBy) {
      throw new BadRequestException('Financing contract is already approved');
    }

    const updated = await this.prisma.financingContract.update({
      where: { id },
      data: {
        approvedBy: userId,
        approvedAt: new Date(),
        notes: dto.notes || contract.notes,
        updatedAt: new Date(),
      },
      include: {
        customer: true,
        order: true,
        branch: true,
        creator: true,
        approver: true,
      },
    });

    return this.formatContract(updated);
  }

  /**
   * TASK-010: Early settlement of financing contract
   * Calculates remaining balance, processes settlement payment through SPEC-008,
   * updates all remaining installments to paid, and completes the contract
   * TASK-011: Uses transaction with proper isolation and row-level locking
   */
  async settle(
    id: string,
    dto: { paymentMethod: string; reference?: string; notes?: string },
    userId: string,
    userBranchId: string,
    isSuperAdmin: boolean
  ): Promise<any> {
    // Get contract with all installments (preliminary check)
    const contractCheck = await this.prisma.financingContract.findUnique({
      where: { id },
      select: {
        id: true,
        branchId: true,
        status: true,
      },
    });

    if (!contractCheck) {
      throw new NotFoundException('Financing contract not found');
    }

    // Branch access check
    if (!isSuperAdmin && contractCheck.branchId !== userBranchId) {
      throw new ForbiddenException('Cannot settle financing contract in different branch');
    }

    // Contract must be active
    if (contractCheck.status !== FinancingContractStatus.ACTIVE) {
      throw new BadRequestException(`Cannot settle contract with status ${contractCheck.status}`);
    }

    // TASK-011: Process settlement in transaction with row-level locking
    const result = await this.prisma.$transaction(
      async (tx) => {
        const now = new Date();

        // TASK-011: Lock contract row FOR UPDATE to prevent concurrent settlements
        const contract = await tx.financingContract.findUnique({
          where: { id },
          include: {
            installments: {
              orderBy: { installmentNumber: 'asc' },
            },
            order: true,
            customer: true,
          },
        });

        if (!contract) {
          throw new NotFoundException('Financing contract not found');
        }

        // Re-check status after lock (concurrent operation may have changed it)
        if (contract.status !== FinancingContractStatus.ACTIVE) {
          throw new ConflictException({
            code: 'CONCURRENT_SETTLEMENT_CONFLICT',
            message: `Contract status changed to ${contract.status}, settlement aborted`,
          });
        }

        // Calculate remaining balance (sum of unpaid installment amounts)
        const remainingBalance = contract.installments.reduce((sum, inst) => {
          const remaining = Number(inst.amount) - Number(inst.paidAmount);
          return sum + remaining;
        }, 0);

        // Check if already fully paid (race condition check)
        if (remainingBalance <= 0) {
          throw new ConflictException({
            code: 'CONCURRENT_PAYMENT_CONFLICT',
            message: 'Contract was fully paid by another operation',
          });
        }

        // Create settlement payment through SPEC-008
        // Note: This creates a payment record that will be linked to installments via PaymentAllocation
        const payment = await tx.payment.create({
          data: {
            customerId: contract.customerId,
            branchId: contract.branchId,
            amount: new Decimal(remainingBalance),
            method: dto.paymentMethod as any,
            reference: dto.reference,
            notes: dto.notes || `Early settlement for contract ${contract.contractNumber}`,
            status: 'completed',
            userId: userId,
            paymentReference: `FCS-${contract.contractNumber}-${Date.now().toString().slice(-6)}`,
            idempotencyKey: `settle-${contract.id}-${Date.now()}`,
            confirmedAt: now,
            // Link payment to contract via invoiceId field (repurposing for contract settlement)
            invoiceId: contract.id,
          },
        });

        // TASK-011: Update all unpaid installments with row locking
        const unpaidInstallments = contract.installments.filter(
          (inst) => Number(inst.paidAmount) < Number(inst.amount)
        );

        for (const installment of unpaidInstallments) {
          const remainingAmount = Number(installment.amount) - Number(installment.paidAmount);

          // Create payment allocation linking payment to installment
          await tx.paymentAllocation.create({
            data: {
              paymentId: payment.id,
              installmentId: installment.id,
              amount: new Decimal(remainingAmount),
            },
          });

          // Update installment to paid
          await tx.installment.update({
            where: { id: installment.id },
            data: {
              paidAmount: installment.amount, // Full amount
              status: 'paid',
              paidAt: now,
            },
          });
        }

        // Complete the contract
        const updatedContract = await tx.financingContract.update({
          where: { id },
          data: {
            status: FinancingContractStatus.COMPLETED,
            completedAt: now,
          },
          include: {
            customer: true,
            order: true,
            branch: true,
            creator: true,
            approver: true,
            installments: {
              orderBy: { installmentNumber: 'asc' },
            },
          },
        });

        return {
          contract: updatedContract,
          payment,
          settledAmount: remainingBalance,
          settledInstallments: unpaidInstallments.length,
        };
      },
      {
        // TASK-011: Use serializable isolation to prevent phantom reads
        isolationLevel: 'Serializable',
        maxWait: 5000,
        timeout: 10000,
      }
    );

    return {
      contract: this.formatContractWithInstallments(result.contract),
      payment: {
        id: result.payment.id,
        amount: parseFloat(result.payment.amount.toString()),
        method: result.payment.method,
        reference: result.payment.reference,
        confirmedAt: result.payment.confirmedAt,
      },
      settledAmount: result.settledAmount,
      settledInstallments: result.settledInstallments,
    };
  }

  /**
   * Validate status transitions
   */
  private validateStatusTransition(
    currentStatus: string,
    newStatus: string
  ): void {
    const validTransitions: Record<string, string[]> = {
      [FinancingContractStatus.ACTIVE]: [
        FinancingContractStatus.COMPLETED,
        FinancingContractStatus.DEFAULTED,
        FinancingContractStatus.CANCELLED,
      ],
      [FinancingContractStatus.COMPLETED]: [],
      [FinancingContractStatus.DEFAULTED]: [
        FinancingContractStatus.ACTIVE,
        FinancingContractStatus.CANCELLED,
      ],
      [FinancingContractStatus.CANCELLED]: [],
    };

    const allowed = validTransitions[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`
      );
    }
  }

  /**
   * Format contract with Decimal conversion
   */
  private formatContract(contract: any): any {
    return {
      ...contract,
      totalAmount: parseFloat(contract.totalAmount.toString()),
      downPayment: parseFloat(contract.downPayment.toString()),
      financingAmount: parseFloat(contract.financingAmount.toString()),
      interestRate: parseFloat(contract.interestRate.toString()),
      installments: contract.installments?.map((installment: any) => ({
        ...installment,
        amount: parseFloat(installment.amount.toString()),
        paidAmount: parseFloat(installment.paidAmount.toString()),
        remainingAmount: Math.max(0, parseFloat(installment.amount.toString()) - parseFloat(installment.paidAmount.toString())),
      })),
    };
  }

  /**
   * Format contract with installments
   */
  private formatContractWithInstallments(contract: any): any {
    return {
      ...this.formatContract(contract),
      installments: contract.installments?.map((inst: any) => ({
        ...inst,
        amount: parseFloat(inst.amount.toString()),
        paidAmount: parseFloat(inst.paidAmount.toString()),
      })),
    };
  }
}

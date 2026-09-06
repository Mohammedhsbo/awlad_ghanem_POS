import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FinancingContractsService } from '../src/financing-contracts/financing-contracts.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { FinancingContractStatus } from '@motorcycle-system/shared-types';
import { Decimal } from '@prisma/client/runtime/library';

describe('FinancingContractsService', () => {
  let service: FinancingContractsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    order: {
      findUnique: vi.fn(),
    },
    customer: {
      findUnique: vi.fn(),
    },
    branch: {
      findUnique: vi.fn(),
    },
    financingContract: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    installment: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancingContractsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<FinancingContractsService>(FinancingContractsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create', () => {
    const validDto = {
      orderId: 'order-123',
      customerId: 'customer-123',
      totalAmount: 10000,
      downPayment: 2000,
      numberOfInstallments: 12,
      installmentFrequency: 'monthly' as const,
      interestRate: 0,
      startDate: new Date('2026-09-01'),
    };

    const mockOrder = {
      id: 'order-123',
      customerId: 'customer-123',
      branchId: 'branch-123',
      status: 'confirmed',
      customer: { id: 'customer-123', firstName: 'John', lastName: 'Doe' },
      branch: { id: 'branch-123', name: 'Riyadh', code: 'RYD' },
    };

    const mockCustomer = {
      id: 'customer-123',
      branchId: 'branch-123',
      firstName: 'John',
      lastName: 'Doe',
    };

    const mockBranch = {
      id: 'branch-123',
      nameAr: 'الرياض',
      nameEn: 'Riyadh',
    };

    it('should create a financing contract successfully', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.financingContract.findFirst.mockResolvedValue(null);
      mockPrismaService.customer.findUnique.mockResolvedValue(mockCustomer);
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);

      const mockContract = {
        id: 'contract-123',
        contractNumber: 'FIN-RYD-2026-00001',
        customerId: 'customer-123',
        orderId: 'order-123',
        branchId: 'branch-123',
        createdBy: 'user-123',
        totalAmount: new Decimal(10000),
        downPayment: new Decimal(2000),
        financingAmount: new Decimal(8000),
        numberOfInstallments: 12,
        installmentFrequency: 'monthly',
        interestRate: new Decimal(0),
        startDate: new Date('2026-09-01'),
        status: FinancingContractStatus.ACTIVE,
        customer: mockCustomer,
        order: mockOrder,
        branch: mockBranch,
        creator: { id: 'user-123', firstName: 'Admin', lastName: 'User' },
        installments: [],
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const txMock = {
          financingContract: {
            create: vi.fn().mockResolvedValue(mockContract),
          },
          installment: {
            create: vi.fn().mockImplementation((data) => ({
              id: `inst-${data.data.installmentNumber}`,
              ...data.data,
              paidAmount: new Decimal(0),
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          },
        };
        return callback(txMock);
      });

      const result = await service.create(
        validDto,
        'user-123',
        'branch-123',
        false
      );

      expect(result).toBeDefined();
      expect(result.contractNumber).toBe('FIN-RYD-2026-00001');
      expect(result.installments).toHaveLength(12);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if order does not exist', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(null);

      await expect(
        service.create(validDto, 'user-123', 'branch-123', false)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user tries to access different branch', async () => {
      const orderInDifferentBranch = {
        ...mockOrder,
        branchId: 'different-branch',
      };
      mockPrismaService.order.findUnique.mockResolvedValue(orderInDifferentBranch);

      await expect(
        service.create(validDto, 'user-123', 'branch-123', false)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if order already has active financing', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.financingContract.findFirst.mockResolvedValue({
        id: 'existing-contract',
        status: FinancingContractStatus.ACTIVE,
      });

      await expect(
        service.create(validDto, 'user-123', 'branch-123', false)
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for invalid down payment', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.financingContract.findFirst.mockResolvedValue(null);
      mockPrismaService.customer.findUnique.mockResolvedValue(mockCustomer);

      const invalidDto = {
        ...validDto,
        downPayment: -100,
      };

      await expect(
        service.create(invalidDto, 'user-123', 'branch-123', false)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if down payment exceeds total amount', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.financingContract.findFirst.mockResolvedValue(null);
      mockPrismaService.customer.findUnique.mockResolvedValue(mockCustomer);

      const invalidDto = {
        ...validDto,
        downPayment: 15000,
      };

      await expect(
        service.create(invalidDto, 'user-123', 'branch-123', false)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid installment count', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.financingContract.findFirst.mockResolvedValue(null);
      mockPrismaService.customer.findUnique.mockResolvedValue(mockCustomer);

      const invalidDto = {
        ...validDto,
        numberOfInstallments: 150,
      };

      await expect(
        service.create(invalidDto, 'user-123', 'branch-123', false)
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow super_admin to access any branch', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.financingContract.findFirst.mockResolvedValue(null);
      mockPrismaService.customer.findUnique.mockResolvedValue(mockCustomer);
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);

      const mockContract = {
        id: 'contract-123',
        contractNumber: 'FIN-RYD-2026-00001',
        customerId: 'customer-123',
        orderId: 'order-123',
        branchId: 'branch-123',
        createdBy: 'user-123',
        totalAmount: new Decimal(10000),
        downPayment: new Decimal(2000),
        financingAmount: new Decimal(8000),
        numberOfInstallments: 12,
        installmentFrequency: 'monthly',
        interestRate: new Decimal(0),
        startDate: new Date('2026-09-01'),
        status: FinancingContractStatus.ACTIVE,
        customer: mockCustomer,
        order: mockOrder,
        branch: mockBranch,
        creator: { id: 'user-123', firstName: 'Admin', lastName: 'User' },
        installments: [],
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const txMock = {
          financingContract: {
            create: vi.fn().mockResolvedValue(mockContract),
          },
          installment: {
            create: vi.fn().mockImplementation((data) => ({
              id: `inst-${data.data.installmentNumber}`,
              ...data.data,
              paidAmount: new Decimal(0),
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          },
        };
        return callback(txMock);
      });

      const result = await service.create(
        validDto,
        'user-123',
        'different-branch',
        true // isSuperAdmin = true
      );

      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated contracts for branch staff', async () => {
      const mockContracts = [
        {
          id: 'contract-1',
          contractNumber: 'FIN-RYD-2026-00001',
          branchId: 'branch-123',
          totalAmount: new Decimal(10000),
          downPayment: new Decimal(2000),
          financingAmount: new Decimal(8000),
          interestRate: new Decimal(0),
          customer: { id: 'customer-1', firstName: 'John', lastName: 'Doe', phone: '1234567890' },
          order: { id: 'order-1', orderNumber: 'ORD-001', status: 'confirmed' },
          branch: { id: 'branch-123', name: 'Riyadh', code: 'RYD' },
          creator: { id: 'user-1', firstName: 'Admin', lastName: 'User' },
          _count: { installments: 12 },
        },
      ];

      mockPrismaService.financingContract.findMany.mockResolvedValue(mockContracts);
      mockPrismaService.financingContract.count.mockResolvedValue(1);

      const result = await service.findAll(
        { page: 1, limit: 20 },
        'user-123',
        'branch-123',
        false,
        false
      );

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should filter by customer for customer role', async () => {
      mockPrismaService.financingContract.findMany.mockResolvedValue([]);
      mockPrismaService.financingContract.count.mockResolvedValue(0);

      await service.findAll(
        { page: 1, limit: 20 },
        'user-123',
        'branch-123',
        false,
        true,
        'customer-123'
      );

      expect(mockPrismaService.financingContract.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerId: 'customer-123',
          }),
        })
      );
    });

    it('should allow super_admin to access all branches', async () => {
      mockPrismaService.financingContract.findMany.mockResolvedValue([]);
      mockPrismaService.financingContract.count.mockResolvedValue(0);

      await service.findAll(
        { page: 1, limit: 20 },
        'user-123',
        'branch-123',
        true, // isSuperAdmin = true
        false
      );

      const callArgs = mockPrismaService.financingContract.findMany.mock.calls[0][0];
      expect(callArgs.where.branchId).toBeUndefined();
    });
  });

  describe('findOne', () => {
    it('should return contract with installments', async () => {
      const mockContract = {
        id: 'contract-123',
        contractNumber: 'FIN-RYD-2026-00001',
        branchId: 'branch-123',
        customerId: 'customer-123',
        totalAmount: new Decimal(10000),
        downPayment: new Decimal(2000),
        financingAmount: new Decimal(8000),
        interestRate: new Decimal(0),
        customer: { id: 'customer-123', firstName: 'John', lastName: 'Doe' },
        order: { id: 'order-123', orderNumber: 'ORD-001' },
        branch: { id: 'branch-123', name: 'Riyadh' },
        creator: { id: 'user-123', firstName: 'Admin' },
        approver: null,
        installments: [
          {
            id: 'inst-1',
            installmentNumber: 1,
            amount: new Decimal(666.67),
            paidAmount: new Decimal(0),
          },
        ],
      };

      mockPrismaService.financingContract.findUnique.mockResolvedValue(mockContract);

      const result = await service.findOne(
        'contract-123',
        'user-123',
        'branch-123',
        false,
        false
      );

      expect(result).toBeDefined();
      expect(result.installments).toHaveLength(1);
    });

    it('should throw NotFoundException if contract does not exist', async () => {
      mockPrismaService.financingContract.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('contract-123', 'user-123', 'branch-123', false, false)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for cross-branch access', async () => {
      const mockContract = {
        id: 'contract-123',
        branchId: 'different-branch',
        customerId: 'customer-123',
      };

      mockPrismaService.financingContract.findUnique.mockResolvedValue(mockContract);

      await expect(
        service.findOne('contract-123', 'user-123', 'branch-123', false, false)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for customer accessing another customer contract', async () => {
      const mockContract = {
        id: 'contract-123',
        branchId: 'branch-123',
        customerId: 'different-customer',
      };

      mockPrismaService.financingContract.findUnique.mockResolvedValue(mockContract);

      await expect(
        service.findOne(
          'contract-123',
          'user-123',
          'branch-123',
          false,
          true,
          'customer-123'
        )
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateStatus', () => {
    it('should update status successfully', async () => {
      const mockContract = {
        id: 'contract-123',
        branchId: 'branch-123',
        status: FinancingContractStatus.ACTIVE,
      };

      const updatedContract = {
        ...mockContract,
        status: FinancingContractStatus.COMPLETED,
        totalAmount: new Decimal(10000),
        downPayment: new Decimal(2000),
        financingAmount: new Decimal(8000),
        interestRate: new Decimal(0),
        customer: {},
        order: {},
        branch: {},
        creator: {},
        approver: null,
      };

      mockPrismaService.financingContract.findUnique.mockResolvedValue(mockContract);
      mockPrismaService.financingContract.update.mockResolvedValue(updatedContract);

      const result = await service.updateStatus(
        'contract-123',
        { status: FinancingContractStatus.COMPLETED },
        'user-123',
        'branch-123',
        false
      );

      expect(result.status).toBe(FinancingContractStatus.COMPLETED);
    });

    it('should throw BadRequestException for invalid status transition', async () => {
      const mockContract = {
        id: 'contract-123',
        branchId: 'branch-123',
        status: FinancingContractStatus.COMPLETED,
      };

      mockPrismaService.financingContract.findUnique.mockResolvedValue(mockContract);

      await expect(
        service.updateStatus(
          'contract-123',
          { status: FinancingContractStatus.ACTIVE },
          'user-123',
          'branch-123',
          false
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve', () => {
    it('should approve contract successfully', async () => {
      const mockContract = {
        id: 'contract-123',
        branchId: 'branch-123',
        approvedBy: null,
      };

      const approvedContract = {
        ...mockContract,
        approvedBy: 'user-123',
        approvedAt: new Date(),
        totalAmount: new Decimal(10000),
        downPayment: new Decimal(2000),
        financingAmount: new Decimal(8000),
        interestRate: new Decimal(0),
        customer: {},
        order: {},
        branch: {},
        creator: {},
        approver: { id: 'user-123', firstName: 'Manager' },
      };

      mockPrismaService.financingContract.findUnique.mockResolvedValue(mockContract);
      mockPrismaService.financingContract.update.mockResolvedValue(approvedContract);

      const result = await service.approve(
        'contract-123',
        { notes: 'Approved' },
        'user-123',
        'branch-123',
        false,
        'branch_admin'
      );

      expect(result.approvedBy).toBe('user-123');
    });

    it('should throw ForbiddenException for non-admin users', async () => {
      const mockContract = {
        id: 'contract-123',
        branchId: 'branch-123',
        approvedBy: null,
      };

      mockPrismaService.financingContract.findUnique.mockResolvedValue(mockContract);

      await expect(
        service.approve(
          'contract-123',
          { notes: 'Approved' },
          'user-123',
          'branch-123',
          false,
          'sales_staff'
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if already approved', async () => {
      const mockContract = {
        id: 'contract-123',
        branchId: 'branch-123',
        approvedBy: 'another-user',
      };

      mockPrismaService.financingContract.findUnique.mockResolvedValue(mockContract);

      await expect(
        service.approve(
          'contract-123',
          { notes: 'Approved' },
          'user-123',
          'branch-123',
          false,
          'branch_admin'
        )
      ).rejects.toThrow(BadRequestException);
    });
  });
});

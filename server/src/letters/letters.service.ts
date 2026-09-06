import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DocumentGeneratorService } from './document-generator.service.js';
import { generateLetterNumber, withUniqueRetry } from '../utils/number-generator.js';
import {
  CreateLetterDto,
  ConfirmReceiptDto,
  RecordNonReceiptDto,
  UpdateLetterDto,
  LetterQueryParams,
  ListLettersResponse,
  CreateLetterResponse,
  LetterWithRelations,
  LetterStatus,
  LetterAction,
  validateLetterStatusTransition,
  GenerateDocumentDto,
} from '@motorcycle-system/shared-types';
import type { User, Branch } from '@prisma/client';

// Helper to convert null to undefined for Prisma
function toUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

@Injectable()
export class LettersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentGeneratorService) private readonly documentGenerator: DocumentGeneratorService,
  ) {}

  /**
   * TASK-005: Create a new letter
   */
  async createLetter(
    dto: CreateLetterDto,
    user: User & { branch: Branch },
  ): Promise<CreateLetterResponse> {
    // Validate customer exists
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });

    if (!customer) {
      throw new NotFoundException(`Customer ${dto.customerId} not found`);
    }

    // Validate motorcycle exists
    const motorcycle = await this.prisma.motorcycle.findUnique({
      where: { id: dto.motorcycleId },
      include: { branch: true },
    });

    if (!motorcycle) {
      throw new NotFoundException(`Motorcycle ${dto.motorcycleId} not found`);
    }

    // Branch isolation: motorcycle must belong to user's branch
    if (motorcycle.branchId !== user.branchId) {
      throw new ForbiddenException('Cannot create letter for motorcycle from another branch');
    }

    // Validate order if provided
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
      });

      if (!order) {
        throw new NotFoundException(`Order ${dto.orderId} not found`);
      }

      if (order.customerId !== dto.customerId) {
        throw new BadRequestException('Order does not belong to the specified customer');
      }

      if (order.branchId !== user.branchId) {
        throw new ForbiddenException('Cannot create letter for order from another branch');
      }
    }

    // Validate reservation if provided
    if (dto.reservationId) {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: dto.reservationId },
      });

      if (!reservation) {
        throw new NotFoundException(`Reservation ${dto.reservationId} not found`);
      }

      if (reservation.customerId !== dto.customerId) {
        throw new BadRequestException('Reservation does not belong to the specified customer');
      }

      if (reservation.branchId !== user.branchId) {
        throw new ForbiddenException('Cannot create letter for reservation from another branch');
      }
    }

    // Generate letter with retry on unique constraint violation
    const operation = async () => {
      const branchCode = user.branch.nameEn.substring(0, 3).toUpperCase();
      const letterNumber = await generateLetterNumber(this.prisma, branchCode);

      return await this.prisma.letter.create({
        data: {
          letterNumber,
          customerId: dto.customerId,
          motorcycleId: dto.motorcycleId,
          orderId: toUndefined(dto.orderId),
          reservationId: toUndefined(dto.reservationId),
          branchId: user.branchId || motorcycle.branchId,
          userId: user.id,
          type: dto.type,
          status: LetterStatus.ISSUED,
          issuedAt: new Date(),
          expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : undefined,
          notes: toUndefined(dto.notes),
        },
        include: {
          customer: true,
          motorcycle: {
            include: {
              brand: true,
              category: true,
            },
          },
          order: true,
          reservation: true,
          branch: true,
          creator: true,
        },
      });
    };

    const letter = await withUniqueRetry(operation);

    // Create history entry
    await this.prisma.letterHistory.create({
      data: {
        letterId: letter.id,
        action: LetterAction.CREATED,
        toStatus: LetterStatus.ISSUED,
        actorId: user.id,
        notes: 'Letter created',
      },
    });

    // Audit log
    await this.audit.log({
      userId: user.id,
      action: 'letter.created',
      entityType: 'letter',
      entityId: letter.id,
      after: {
        letterNumber: letter.letterNumber,
        type: letter.type,
        customerId: letter.customerId,
      },
    });

    return {
      success: true,
      letter: letter as LetterWithRelations,
      message: 'Letter created successfully',
    };
  }

  /**
   * TASK-005: Get letter by ID
   */
  async getLetterById(letterId: string, user: User): Promise<LetterWithRelations> {
    const letter = await this.prisma.letter.findUnique({
      where: { id: letterId },
      include: {
        customer: true,
        motorcycle: {
          include: {
            brand: true,
            category: true,
          },
        },
        order: true,
        reservation: true,
        branch: true,
        creator: true,
        confirmer: true,
        documents: {
          include: {
            creator: true,
          },
          orderBy: {
            version: 'desc',
          },
        },
        history: {
          include: {
            actor: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!letter) {
      throw new NotFoundException(`Letter ${letterId} not found`);
    }

    // Branch isolation; a null branch means the user is not branch-restricted.
    if (user.branchId !== null && letter.branchId !== user.branchId) {
      throw new ForbiddenException('Cannot access letter from another branch');
    }

    return letter as LetterWithRelations;
  }

  /**
   * TASK-005: Update letter
   */
  async updateLetter(
    letterId: string,
    dto: UpdateLetterDto,
    user: User,
  ): Promise<LetterWithRelations> {
    const letter = await this.getLetterById(letterId, user);

    // Cannot update received letters
    if (letter.status === LetterStatus.RECEIVED) {
      throw new BadRequestException('Cannot update a received letter');
    }

    const updated = await this.prisma.letter.update({
      where: { id: letterId },
      data: {
        expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : undefined,
        notes: toUndefined(dto.notes),
      },
      include: {
        customer: true,
        motorcycle: {
          include: {
            brand: true,
            category: true,
          },
        },
        order: true,
        reservation: true,
        branch: true,
        creator: true,
        confirmer: true,
        documents: {
          include: {
            creator: true,
          },
        },
        history: {
          include: {
            actor: true,
          },
        },
      },
    });

    // Audit log
    await this.audit.log({
      userId: user.id,
      action: 'letter.updated',
      entityType: 'letter',
      entityId: letterId,
      after: dto,
    });

    return updated as LetterWithRelations;
  }

  /**
   * TASK-007: List letters with filtering and pagination
   */
  async listLetters(query: LetterQueryParams, user: User): Promise<ListLettersResponse> {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      customerId,
      motorcycleId,
      orderId,
      branchId,
      search,
      startDate,
      endDate,
    } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const effectiveBranchId = branchId ?? user.branchId;
    const where: any = {
      ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
    };

    // Apply filters with proper type conversion
    if (status) where.status = status;
    if (type) where.type = type;
    if (customerId && customerId !== null) where.customerId = customerId;
    if (motorcycleId && motorcycleId !== null) where.motorcycleId = motorcycleId;
    if (orderId && orderId !== null) where.orderId = orderId;

    if (search) {
      where.OR = [
        { letterNumber: { contains: search, mode: 'insensitive' as const } },
        { customer: { name: { contains: search, mode: 'insensitive' as const } } },
        { customer: { phone: { contains: search } } },
        { motorcycle: { vin: { contains: search, mode: 'insensitive' as const } } },
      ];
    }

    if (startDate || endDate) {
      where.issuedAt = {};
      if (startDate) where.issuedAt.gte = new Date(startDate);
      if (endDate) where.issuedAt.lte = new Date(endDate);
    }

    // Execute queries in parallel
    const [letters, total] = await Promise.all([
      this.prisma.letter.findMany({
        where,
        skip,
        take: limit,
        include: {
          customer: true,
          motorcycle: {
            include: {
              brand: true,
              category: true,
            },
          },
          order: true,
          branch: true,
          creator: true,
        },
        orderBy: {
          issuedAt: 'desc',
        },
      }),
      this.prisma.letter.count({ where }),
    ]);

    return {
      letters: letters as any[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * TASK-006: Confirm receipt
   */
  async confirmReceipt(
    letterId: string,
    dto: ConfirmReceiptDto,
    user: User,
  ): Promise<LetterWithRelations> {
    const letter = await this.getLetterById(letterId, user);

    // Validate status transition
    try {
      validateLetterStatusTransition(letter.status as LetterStatus, LetterStatus.RECEIVED);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }

    const now = new Date();

    // Update letter status
    const updated = await this.prisma.letter.update({
      where: { id: letterId },
      data: {
        status: LetterStatus.RECEIVED,
        confirmedAt: now,
        confirmedBy: user.id,
        notes: dto.notes || letter.notes,
      },
      include: {
        customer: true,
        motorcycle: {
          include: {
            brand: true,
            category: true,
          },
        },
        order: true,
        reservation: true,
        branch: true,
        creator: true,
        confirmer: true,
        documents: {
          include: {
            creator: true,
          },
        },
        history: {
          include: {
            actor: true,
          },
        },
      },
    });

    // Create history entry
    await this.prisma.letterHistory.create({
      data: {
        letterId,
        action: LetterAction.CONFIRMED,
        fromStatus: letter.status,
        toStatus: LetterStatus.RECEIVED,
        actorId: user.id,
        reason: toUndefined(dto.reason),
        notes: toUndefined(dto.notes),
      },
    });

    // Audit log
    await this.audit.log({
      userId: user.id,
      action: 'letter.confirmed',
      entityType: 'letter',
      entityId: letterId,
      after: {
        letterNumber: letter.letterNumber,
        confirmedAt: now,
      },
    });

    // TASK-011: Check if order should be completed
    if (letter.orderId) {
      // Import dynamically to avoid circular dependency
      const { OrderLetterIntegrationService } = await import('./order-letter-integration.service.js');
      const integrationService = new OrderLetterIntegrationService(this.prisma, this);
      await integrationService.checkAndCompleteOrder(letterId);
    }

    return updated as LetterWithRelations;
  }

  /**
   * TASK-006: Record non-receipt
   */
  async recordNonReceipt(
    letterId: string,
    dto: RecordNonReceiptDto,
    user: User,
  ): Promise<LetterWithRelations> {
    const letter = await this.getLetterById(letterId, user);

    // Validate status transition
    try {
      validateLetterStatusTransition(letter.status as LetterStatus, LetterStatus.NOT_RECEIVED);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }

    // Update letter status
    const updated = await this.prisma.letter.update({
      where: { id: letterId },
      data: {
        status: LetterStatus.NOT_RECEIVED,
        notes: dto.notes || letter.notes,
      },
      include: {
        customer: true,
        motorcycle: {
          include: {
            brand: true,
            category: true,
          },
        },
        order: true,
        reservation: true,
        branch: true,
        creator: true,
        confirmer: true,
        documents: {
          include: {
            creator: true,
          },
        },
        history: {
          include: {
            actor: true,
          },
        },
      },
    });

    // Create history entry
    await this.prisma.letterHistory.create({
      data: {
        letterId,
        action: LetterAction.NOT_RECEIVED_RECORDED,
        fromStatus: letter.status,
        toStatus: LetterStatus.NOT_RECEIVED,
        actorId: user.id,
        reason: dto.reason,
        notes: toUndefined(dto.notes),
      },
    });

    // Audit log
    await this.audit.log({
      userId: user.id,
      action: 'letter.not_received',
      entityType: 'letter',
      entityId: letterId,
      after: {
        letterNumber: letter.letterNumber,
        reason: dto.reason,
      },
    });

    return updated as LetterWithRelations;
  }

  /**
   * TASK-008: Generate document for letter
   */
  async generateDocument(
    letterId: string,
    dto: GenerateDocumentDto,
    user: User,
  ): Promise<any> {
    const letter = await this.getLetterById(letterId, user);

    const result = await this.documentGenerator.generateDocument({
      letterId,
      documentType: dto.documentType,
      regenerate: dto.regenerate,
      userId: user.id,
    });

    // Create history entry
    await this.prisma.letterHistory.create({
      data: {
        letterId,
        action: LetterAction.DOCUMENT_GENERATED,
        actorId: user.id,
        notes: `${dto.documentType} document ${dto.regenerate ? 'regenerated' : 'generated'} (v${result.version})`,
      },
    });

    // Audit log
    await this.audit.log({
      userId: user.id,
      action: 'letter.document_generated',
      entityType: 'letter',
      entityId: letterId,
      after: {
        letterNumber: letter.letterNumber,
        documentType: dto.documentType,
        version: result.version,
      },
    });

    return result;
  }

  /**
   * TASK-008: Get document URL
   */
  async getDocumentUrl(letterId: string, documentId: string, user: User): Promise<string> {
    const letter = await this.getLetterById(letterId, user);

    const document = await this.prisma.letterDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    if (document.letterId !== letterId) {
      throw new BadRequestException('Document does not belong to this letter');
    }

    return this.documentGenerator.getDocumentUrl(document.storageRef);
  }

  /**
   * TASK-009: Get letter history
   */
  async getLetterHistory(letterId: string, user: User): Promise<any[]> {
    const letter = await this.getLetterById(letterId, user);

    const history = await this.prisma.letterHistory.findMany({
      where: { letterId },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return history;
  }

  /**
   * TASK-010: Get letters for a specific customer
   */
  async getCustomerLetters(customerId: string, user: User): Promise<any[]> {
    // Verify customer exists and belongs to branch
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const letters = await this.prisma.letter.findMany({
      where: {
        customerId,
        ...(user.branchId ? { branchId: user.branchId } : {}),
      },
      include: {
        motorcycle: {
          include: {
            brand: true,
            category: true,
          },
        },
        order: true,
        branch: true,
        creator: true,
        documents: {
          orderBy: {
            version: 'desc',
          },
          take: 1, // Latest document only
        },
      },
      orderBy: {
        issuedAt: 'desc',
      },
    });

    return letters;
  }

  /**
   * Get letter statistics for branch
   */
  async getLetterStats(user: User): Promise<any> {
    const [total, issued, received, notReceived, byType] = await Promise.all([
      this.prisma.letter.count({
        where: user.branchId ? { branchId: user.branchId } : {},
      }),
      this.prisma.letter.count({
        where: {
          ...(user.branchId ? { branchId: user.branchId } : {}),
          status: LetterStatus.ISSUED,
        },
      }),
      this.prisma.letter.count({
        where: {
          ...(user.branchId ? { branchId: user.branchId } : {}),
          status: LetterStatus.RECEIVED,
        },
      }),
      this.prisma.letter.count({
        where: {
          ...(user.branchId ? { branchId: user.branchId } : {}),
          status: LetterStatus.NOT_RECEIVED,
        },
      }),
      this.prisma.letter.groupBy({
        by: ['type'],
        where: user.branchId ? { branchId: user.branchId } : {},
        _count: true,
      }),
    ]);

    return {
      total,
      byStatus: {
        issued,
        received,
        notReceived,
      },
      byType: byType.reduce((acc, item) => {
        acc[item.type] = (item._count as any);
        return acc;
      }, {} as Record<string, any>),
    };
  }
}

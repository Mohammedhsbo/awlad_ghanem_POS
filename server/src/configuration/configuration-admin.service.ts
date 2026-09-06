import { Inject, Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigurationService } from './configuration.service.js';
import { ConfigurationCacheService } from './configuration-cache.service.js';
import {
  UpdateSystemConfigurationDto,
  UpdateCompanyConfigurationDto,
  UpdateBranchConfigurationDto,
  DocumentNumberingUpdateDto,
  ResetNumberingDto,
  WorkingHoursUpdateDto,
  CreateHolidayDto,
} from './dto/update-configuration.dto.js';
import { ConfigurationQueryDto, ConfigurationAuditQueryDto } from './dto/query-configuration.dto.js';

@Injectable()
export class ConfigurationAdminService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ConfigurationService) private configService: ConfigurationService,
    @Inject(ConfigurationCacheService) private cacheService: ConfigurationCacheService,
  ) {}

  // System Configuration Management
  async getSystemConfiguration(query: ConfigurationQueryDto) {
    const where: any = { isActive: true };

    if (query.category) {
      where.category = query.category;
    }

    if (query.keys && query.keys.length > 0) {
      where.configKey = { in: query.keys };
    }

    if (query.include_inactive) {
      delete where.isActive;
    }

    return this.prisma.systemConfiguration.findMany({
      where,
      orderBy: [{ category: 'asc' }, { configKey: 'asc' }],
    });
  }

  async updateSystemConfiguration(
    dto: UpdateSystemConfigurationDto,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const results = [];

    for (const config of dto.configurations) {
      const existing = await this.prisma.systemConfiguration.findUnique({
        where: { configKey: config.configKey },
      });

      if (!existing) {
        throw new NotFoundException(`Configuration key "${config.configKey}" not found`);
      }

      const updated = await this.prisma.systemConfiguration.update({
        where: { configKey: config.configKey },
        data: {
          configValue: config.configValue,
          updatedAt: new Date(),
        },
      });

      // Audit the change
      await this.prisma.configurationAudit.create({
        data: {
          configType: 'system',
          configKey: config.configKey,
          previousValue: existing.configValue,
          newValue: config.configValue,
          changeReason: config.reason,
          changedBy: userId,
          ipAddress,
          userAgent,
        },
      });

      results.push(updated);
    }

    // Invalidate cache - system changes affect everything
    await this.configService.invalidateCache(dto.configurations.map(c => c.configKey));
    await this.cacheService.invalidateSystem();

    return { updated: results.length, configurations: results };
  }

  // Company Configuration Management
  async getCompanyConfiguration(query: ConfigurationQueryDto) {
    const where: any = { isActive: true };

    if (query.keys && query.keys.length > 0) {
      where.configKey = { in: query.keys };
    }

    return this.prisma.companyConfiguration.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ configKey: 'asc' }, { version: 'desc' }],
    });
  }

  async updateCompanyConfiguration(
    dto: UpdateCompanyConfigurationDto,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const results = [];

    for (const config of dto.configurations) {
      // Get existing configuration
      const existing = await this.prisma.companyConfiguration.findFirst({
        where: {
          configKey: config.configKey,
          isActive: true,
        },
        orderBy: { version: 'desc' },
      });

      const newVersion = existing ? existing.version + 1 : 1;

      // Create new version
      const updated = await this.prisma.companyConfiguration.create({
        data: {
          configKey: config.configKey,
          configValue: config.configValue,
          dataType: existing?.dataType || 'string',
          version: newVersion,
          replacesConfigId: existing?.id,
          effectiveFrom: config.effectiveFrom,
          effectiveTo: config.effectiveTo,
          createdBy: userId,
        },
      });

      // Audit the change
      await this.prisma.configurationAudit.create({
        data: {
          configType: 'company',
          configKey: config.configKey,
          previousValue: existing?.configValue,
          newValue: config.configValue,
          changeReason: config.reason,
          changedBy: userId,
          ipAddress,
          userAgent,
        },
      });

      results.push(updated);
    }

    // Invalidate cache - company changes affect all branches
    await this.configService.invalidateCache(dto.configurations.map(c => c.configKey));
    await this.cacheService.invalidateCompany();

    return { updated: results.length, configurations: results };
  }

  // Branch Configuration Management
  async getBranchConfiguration(
    branchId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
  ) {
    if (!isSuperAdmin && branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only access configuration for your own branch',
      });
    }

    return this.prisma.branchConfiguration.findMany({
      where: {
        branchId,
        isActive: true,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { configKey: 'asc' },
    });
  }

  async updateBranchConfiguration(
    branchId: string,
    dto: UpdateBranchConfigurationDto,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (!isSuperAdmin && branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only manage configuration for your own branch',
      });
    }

    const results = [];

    for (const config of dto.configurations) {
      const existing = await this.prisma.branchConfiguration.findUnique({
        where: {
          branchId_configKey: {
            branchId,
            configKey: config.configKey,
          },
        },
      });

      let updated;
      if (existing) {
        updated = await this.prisma.branchConfiguration.update({
          where: { id: existing.id },
          data: {
            configValue: config.configValue,
            updatedAt: new Date(),
          },
        });
      } else {
        updated = await this.prisma.branchConfiguration.create({
          data: {
            branchId,
            configKey: config.configKey,
            configValue: config.configValue,
            dataType: 'string',
            inheritsFromCompany: false,
            createdBy: userId,
          },
        });
      }

      // Audit the change
      await this.prisma.configurationAudit.create({
        data: {
          configType: 'branch',
          configKey: config.configKey,
          branchId,
          previousValue: existing?.configValue,
          newValue: config.configValue,
          changeReason: config.reason,
          changedBy: userId,
          ipAddress,
          userAgent,
        },
      });

      results.push(updated);
    }

    // Invalidate cache - branch-specific invalidation
    await this.configService.invalidateCache(dto.configurations.map(c => c.configKey), branchId);
    await this.cacheService.invalidateBranch(branchId);

    return { updated: results.length, configurations: results };
  }

  async listAllBranchConfigurations() {
    const branches = await this.prisma.branch.findMany({
      where: { isActive: true },
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        configurations: {
          where: { isActive: true },
          select: {
            configKey: true,
            configValue: true,
            inheritsFromCompany: true,
            updatedAt: true,
          },
        },
      },
    });

    return branches;
  }

  // Document Numbering Management
  async getDocumentNumbering(documentType?: string, branchId?: string) {
    const where: any = { isActive: true };

    if (documentType) {
      where.documentType = documentType;
    }

    if (branchId) {
      where.branchId = branchId;
    }

    return this.prisma.documentNumbering.findMany({
      where,
      include: {
        branch: {
          select: {
            id: true,
            nameEn: true,
            nameAr: true,
          },
        },
      },
      orderBy: [{ documentType: 'asc' }, { branchId: 'asc' }],
    });
  }

  async updateDocumentNumbering(
    documentType: string,
    dto: DocumentNumberingUpdateDto,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Find existing numbering configuration
    const existing = await this.prisma.documentNumbering.findFirst({
      where: {
        documentType,
        isActive: true,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Document numbering for type "${documentType}" not found`);
    }

    const updated = await this.prisma.documentNumbering.update({
      where: { id: existing.id },
      data: {
        prefix: dto.prefix ?? existing.prefix,
        includeBranchCode: dto.includeBranchCode ?? existing.includeBranchCode,
        includeYear: dto.includeYear ?? existing.includeYear,
        sequenceLength: dto.sequenceLength ?? existing.sequenceLength,
        resetPolicy: dto.resetPolicy as any ?? existing.resetPolicy,
        updatedAt: new Date(),
      },
    });

    // Audit the change
    await this.prisma.configurationAudit.create({
      data: {
        configType: 'document_numbering',
        configKey: `numbering.${documentType}`,
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated),
        changeReason: dto.reason,
        changedBy: userId,
        ipAddress,
        userAgent,
      },
    });

    return updated;
  }

  async resetDocumentSequence(
    documentType: string,
    dto: ResetNumberingDto,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (!dto.confirmed) {
      throw new BadRequestException('Sequence reset requires confirmation');
    }

    const existing = await this.prisma.documentNumbering.findFirst({
      where: {
        documentType,
        isActive: true,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Document numbering for type "${documentType}" not found`);
    }

    const updated = await this.prisma.documentNumbering.update({
      where: { id: existing.id },
      data: {
        currentSequence: dto.newStartingNumber,
        lastResetDate: new Date(),
        updatedAt: new Date(),
      },
    });

    // Audit the change
    await this.prisma.configurationAudit.create({
      data: {
        configType: 'document_numbering_reset',
        configKey: `numbering.${documentType}.sequence`,
        previousValue: existing.currentSequence.toString(),
        newValue: dto.newStartingNumber.toString(),
        changeReason: dto.reason,
        changedBy: userId,
        ipAddress,
        userAgent,
      },
    });

    return updated;
  }

  // Working Hours Management
  async getWorkingHours(
    branchId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
  ) {
    if (!isSuperAdmin && branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only access working hours for your own branch',
      });
    }

    return this.prisma.workingHours.findMany({
      where: {
        branchId,
        isActive: true,
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { dayOfWeek: 'asc' }],
    });
  }

  async updateWorkingHours(
    branchId: string,
    dtos: WorkingHoursUpdateDto[],
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
  ) {
    if (!isSuperAdmin && branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only manage working hours for your own branch',
      });
    }

    const results = [];

    for (const dto of dtos) {
      const isClosed = dto.isClosed ?? false;
      const data = {
        branchId,
        dayOfWeek: dto.dayOfWeek,
        openTime: isClosed ? null : this.parseWorkingHour(dto.openTime, 'openTime'),
        closeTime: isClosed ? null : this.parseWorkingHour(dto.closeTime, 'closeTime'),
        isClosed,
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo,
      };
      const existing = await this.prisma.workingHours.findFirst({
        where: {
          branchId,
          dayOfWeek: dto.dayOfWeek,
          isActive: true,
          effectiveTo: null,
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      const saved = existing
        ? await this.prisma.workingHours.update({ where: { id: existing.id }, data })
        : await this.prisma.workingHours.create({ data });

      results.push(saved);
    }

    return { created: results.length, workingHours: results };
  }

  private parseWorkingHour(value: string | undefined, field: string): Date {
    if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new BadRequestException(`${field} must use HH:mm format`);
    }

    return new Date(`1970-01-01T${value}:00.000Z`);
  }

  // Holiday Management
  async getHolidays(branchId?: string) {
    const where: any = { isActive: true };

    if (branchId) {
      where.OR = [
        { scope: 'system' },
        { scope: 'branch', branchId },
      ];
    } else {
      where.scope = 'system';
    }

    return this.prisma.holiday.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
        branch: {
          select: {
            id: true,
            nameEn: true,
            nameAr: true,
          },
        },
      },
      orderBy: { holidayDate: 'asc' },
    });
  }

  async createHoliday(dto: CreateHolidayDto, userId: string) {
    return this.prisma.holiday.create({
      data: {
        holidayName: dto.holidayName,
        holidayDate: dto.holidayDate,
        scope: dto.scope as any,
        branchId: dto.branchId,
        isRecurring: dto.isRecurring ?? false,
        recurrencePattern: dto.recurrencePattern,
        createdBy: userId,
      },
    });
  }

  async deleteHoliday(id: string) {
    return this.prisma.holiday.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Configuration Audit
  async getConfigurationAudit(query: ConfigurationAuditQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 50);
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 50;

    const where: any = {};

    if (query.config_type) {
      where.configType = query.config_type;
    }

    if (query.config_key) {
      where.configKey = query.config_key;
    }

    if (query.branch_id) {
      where.branchId = query.branch_id;
    }

    if (query.from_date || query.to_date) {
      where.changeTimestamp = {};
      if (query.from_date) {
        where.changeTimestamp.gte = query.from_date;
      }
      if (query.to_date) {
        where.changeTimestamp.lte = query.to_date;
      }
    }

    const [audits, total] = await Promise.all([
      this.prisma.configurationAudit.findMany({
        where,
        include: {
          changer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          branch: {
            select: {
              id: true,
              nameEn: true,
              nameAr: true,
            },
          },
        },
        orderBy: { changeTimestamp: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.configurationAudit.count({ where }),
    ]);

    return {
      data: audits,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 0,
      },
    };
  }
}

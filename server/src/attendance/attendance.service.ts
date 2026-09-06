import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AppError } from "../common/errors/app-error.js";

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  branchId: string | null;
  branchNameEn: string | null;
  branchNameAr: string | null;
  checkIn: string;
  checkOut: string | null;
  notes: string | null;
  createdAt: string;
}

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /** Create a new check-in. Throws if user already has an open record. */
  async checkIn(
    userId: string,
    branchId: string | null,
    notes?: string,
  ): Promise<AttendanceRecord> {
    const open = await this.prisma.desktopAttendance.findFirst({
      where: { userId, checkOut: null },
    });
    if (open) {
      throw new AppError(
        "ALREADY_CHECKED_IN",
        409,
        "You already have an open check-in. Please check out first.",
      );
    }

    const record = await this.prisma.desktopAttendance.create({
      data: {
        userId,
        branchId,
        checkIn: new Date(),
        notes,
      },
      include: {
        user: { select: { name: true, email: true } },
        branch: { select: { nameEn: true, nameAr: true } },
      },
    });

    return this.toRecord(record);
  }

  /** Close the latest open check-in for a user. */
  async checkOut(userId: string, notes?: string): Promise<AttendanceRecord> {
    const open = await this.prisma.desktopAttendance.findFirst({
      where: { userId, checkOut: null },
      orderBy: { checkIn: "desc" },
    });
    if (!open) {
      throw new AppError(
        "NOT_CHECKED_IN",
        409,
        "No open check-in found. Please check in first.",
      );
    }

    const record = await this.prisma.desktopAttendance.update({
      where: { id: open.id },
      data: {
        checkOut: new Date(),
        ...(notes !== undefined && { notes }),
      },
      include: {
        user: { select: { name: true, email: true } },
        branch: { select: { nameEn: true, nameAr: true } },
      },
    });

    return this.toRecord(record);
  }

  /** Get records for the calling user (own history). */
  async listForUser(
    userId: string,
    params: { page?: number; limit?: number; startDate?: string; endDate?: string },
  ): Promise<{ items: AttendanceRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return this.listInternal({ userId, ...params });
  }

  /** Admin: get all records, optionally filtered by userId / date range. */
  async listAll(params: {
    userId?: string;
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{ items: AttendanceRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    return this.listInternal(params);
  }

  private async listInternal(params: {
    userId?: string;
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where = {
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.startDate || params.endDate
        ? {
            checkIn: {
              ...(params.startDate ? { gte: new Date(params.startDate) } : {}),
              ...(params.endDate ? { lte: new Date(params.endDate + "T23:59:59.999Z") } : {}),
            },
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.desktopAttendance.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          branch: { select: { nameEn: true, nameAr: true } },
        },
        orderBy: { checkIn: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.desktopAttendance.count({ where }),
    ]);

    return {
      items: records.map((r) => this.toRecord(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private toRecord(
    r: {
      id: string;
      userId: string;
      branchId: string | null;
      checkIn: Date;
      checkOut: Date | null;
      notes: string | null;
      createdAt: Date;
      user: { name: string; email: string };
      branch: { nameEn: string; nameAr: string } | null;
    },
  ): AttendanceRecord {
    return {
      id: r.id,
      userId: r.userId,
      userName: r.user.name,
      userEmail: r.user.email,
      branchId: r.branchId,
      branchNameEn: r.branch?.nameEn ?? null,
      branchNameAr: r.branch?.nameAr ?? null,
      checkIn: r.checkIn.toISOString(),
      checkOut: r.checkOut?.toISOString() ?? null,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    };
  }
}

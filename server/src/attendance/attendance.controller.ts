import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { AppError } from "../common/errors/app-error.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { AttendanceService } from "./attendance.service.js";

@Controller("attendance")
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(
    @Inject(AttendanceService) private readonly service: AttendanceService,
  ) {}

  /**
   * POST /attendance/check-in
   * Creates an attendance record with checkIn = now().
   * Body (optional): { notes?: string }
   */
  @Post("check-in")
  async checkIn(
    @Request() req: AuthenticatedRequest,
    @Body() body: { notes?: string },
  ) {
    if (req.user.isCustomer) {
      throw new AppError("FORBIDDEN", 403, "Customers cannot use the desktop");
    }
    const data = await this.service.checkIn(
      req.user.id,
      req.user.branchId,
      body.notes,
    );
    return { success: true, data };
  }

  /**
   * POST /attendance/check-out
   * Closes the open check-in for the calling user.
   * Body (optional): { notes?: string }
   */
  @Post("check-out")
  async checkOut(
    @Request() req: AuthenticatedRequest,
    @Body() body: { notes?: string },
  ) {
    if (req.user.isCustomer) {
      throw new AppError("FORBIDDEN", 403, "Customers cannot use the desktop");
    }
    const data = await this.service.checkOut(req.user.id, body.notes);
    return { success: true, data };
  }

  /**
   * GET /attendance/me
   * Returns the calling user's own attendance records (paginated).
   * Query: page, limit, startDate, endDate
   */
  @Get("me")
  async getMyAttendance(
    @Request() req: AuthenticatedRequest,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    if (req.user.isCustomer) {
      throw new AppError("FORBIDDEN", 403, "Customers cannot use the desktop");
    }
    const result = await this.service.listForUser(req.user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      startDate,
      endDate,
    });
    return { success: true, data: result.items, meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } };
  }

  /**
   * GET /attendance
   * Admin: all records filtered by userId / date.
   * Requires super_admin.
   */
  @Get()
  async listAll(
    @Request() req: AuthenticatedRequest,
    @Query("userId") userId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    if (!req.user.isSuperAdmin) {
      throw new AppError("FORBIDDEN", 403, "Only super_admin can view all attendance records");
    }
    const result = await this.service.listAll({
      userId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      startDate,
      endDate,
    });
    return { success: true, data: result.items, meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } };
  }
}

import {
  Inject,
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import {
  CreateRefundRequest,
  createRefundSchema,
  Resource,
  Action,
} from "@motorcycle-system/shared-types";
import { RefundsService } from "./refunds.service.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import { RequirePermission } from "../auth/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";

@Controller("refunds")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RefundsController {
  constructor(@Inject(RefundsService) private readonly refundsService: RefundsService) {}

  @Post()
  @RequirePermission(Resource.PAYMENTS, Action.REFUND)
  async create(
    @Body(new ZodValidationPipe(createRefundSchema)) data: CreateRefundRequest,
    @Req() req: AuthenticatedRequest
  ) {
    const refund = await this.refundsService.create(
      data,
      req.user.id,
      req.user.branchId,
      req.user.isSuperAdmin
    );
    return { success: true, data: refund };
  }

  @Get()
  @RequirePermission(Resource.PAYMENTS, Action.READ)
  async list(
    @Req() req: AuthenticatedRequest,
    @Query("paymentId") paymentId?: string,
    @Query("customerId") customerId?: string,
    @Query("branchId") branchId?: string,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const filters = {
      paymentId,
      customerId,
      branchId,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    };

    const result = await this.refundsService.list(
      filters,
      req.user.id,
      req.user.branchId,
      req.user.isSuperAdmin
    );
    return { success: true, data: result.items, meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } };
  }

  @Get(":id")
  @RequirePermission(Resource.PAYMENTS, Action.READ)
  async findOne(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const refund = await this.refundsService.findById(
      id,
      req.user.id,
      req.user.branchId,
      req.user.isSuperAdmin
    );
    return { success: true, data: refund };
  }
}

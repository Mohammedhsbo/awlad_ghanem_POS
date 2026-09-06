import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { SalesRequestsService } from "./sales-requests.service.js";
import { saleRequestCreateSchema } from "./sales-requests.schemas.js";

@Controller("sales-requests")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesRequestsController {
  constructor(private readonly service: SalesRequestsService) {}

  @Get()
  list(@Query("branchId") branchId?: string) {
    return this.service.list(branchId).then((data) => ({ success: true, data }));
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(saleRequestCreateSchema)) body: any
  ) {
    return this.service
      .create(req.user, body)
      .then((data) => ({ success: true, data }));
  }
}

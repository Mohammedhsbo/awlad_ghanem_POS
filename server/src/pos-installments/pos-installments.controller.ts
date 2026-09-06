import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PosInstallmentsService } from "./pos-installments.service.js";
import { generatePlanSchema } from "./pos-installments.schemas.js";

@Controller("pos-installments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PosInstallmentsController {
  constructor(private readonly service: PosInstallmentsService) {}

  @Get()
  list(@Query("branchId") branchId?: string, @Query("query") query?: string) {
    return this.service.list(branchId, query).then((data) => ({ success: true, data }));
  }

  @Post("generate")
  generate(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(generatePlanSchema)) body: any
  ) {
    return this.service
      .generateFromRequest(req.user, body)
      .then((data) => ({ success: true, data }));
  }
}

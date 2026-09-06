import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PosReservationsService } from "./pos-reservations.service.js";
import { posReservationCreateSchema } from "./pos-reservations.schemas.js";

@Controller("pos-reservations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PosReservationsController {
  constructor(private readonly service: PosReservationsService) {}

  @Get()
  list(@Query("branchId") branchId?: string) {
    return this.service.list(branchId).then((data) => ({ success: true, data }));
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(posReservationCreateSchema)) body: any
  ) {
    return this.service
      .create(req.user, body)
      .then((data) => ({ success: true, data }));
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string) {
    return this.service.cancel(id).then((data) => ({ success: true, data }));
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { SalesService } from "./sales.service.js";
import { saleCreateSchema } from "./sales.schemas.js";

@Controller("sales")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Get()
  list(@Query("branchId") branchId?: string) {
    return this.service.list(branchId).then((data) => ({ success: true, data }));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(id).then((data) => ({ success: true, data }));
  }

  @Post()
  @UseInterceptors(FileInterceptor("customerIdImage"))
  create(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(saleCreateSchema)) body: any,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.service
      .create(req.user, body, file)
      .then((data) => ({ success: true, data }));
  }
}

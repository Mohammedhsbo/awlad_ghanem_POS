import {
  Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Req,
  UploadedFiles, UseGuards, UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { Action, createCustomerInquirySchema, Resource, type CreateCustomerInquiryDto } from "@motorcycle-system/shared-types";
import { RequirePermission } from "../auth/decorators/permissions.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { CustomerInquiriesService } from "./customer-inquiries.service.js";
import "multer";

@Controller("customer-inquiries")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomerInquiriesController {
  constructor(@Inject(CustomerInquiriesService) private readonly service: CustomerInquiriesService) {}

  @Post()
  @RequirePermission(Resource.CUSTOMER, Action.CREATE)
  @UseInterceptors(FileFieldsInterceptor([
    { name: "idCardFrontImage", maxCount: 1 },
    { name: "idCardBackImage", maxCount: 1 },
  ]))
  async create(
    @Body(new ZodValidationPipe(createCustomerInquirySchema)) body: CreateCustomerInquiryDto,
    @UploadedFiles() files: { idCardFrontImage?: Express.Multer.File[]; idCardBackImage?: Express.Multer.File[] },
    @Req() request: AuthenticatedRequest,
  ) {
    return { success: true, data: await this.service.create(body, files, request.user) };
  }

  @Get()
  @RequirePermission(Resource.CUSTOMER, Action.READ)
  async list(@Req() request: AuthenticatedRequest) {
    return { success: true, data: await this.service.list(request.user) };
  }

  @Get(":id")
  @RequirePermission(Resource.CUSTOMER, Action.READ)
  async get(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return { success: true, data: await this.service.get(id, request.user) };
  }

  @Post(":id/send-whatsapp")
  @RequirePermission(Resource.CUSTOMER, Action.CREATE)
  async sendWhatsApp(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return { success: true, data: await this.service.sendWhatsApp(id, request.user) };
  }
}
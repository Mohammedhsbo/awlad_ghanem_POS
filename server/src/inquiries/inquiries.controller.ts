import { Body, Controller, Get, Param, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { InquiriesService } from "./inquiries.service.js";
import { inquiryCreateSchema } from "./inquiries.schemas.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

@Controller("inquiries")
export class InquiriesController {
  constructor(private readonly service: InquiriesService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  list() {
    return this.service.list().then((data) => ({ success: true, data }));
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: "documentImage", maxCount: 1 },
      { name: "idCardFrontImage", maxCount: 1 },
      { name: "idCardBackImage", maxCount: 1 },
      { name: "guarantorIdFrontImage", maxCount: 1 },
      { name: "guarantorIdBackImage", maxCount: 1 },
      { name: "guarantorSignatureImage", maxCount: 1 },
    ])
  )
  create(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(inquiryCreateSchema)) body: any,
    @UploadedFiles()
    files: {
      documentImage?: Express.Multer.File[];
      idCardFrontImage?: Express.Multer.File[];
      idCardBackImage?: Express.Multer.File[];
      guarantorIdFrontImage?: Express.Multer.File[];
      guarantorIdBackImage?: Express.Multer.File[];
      guarantorSignatureImage?: Express.Multer.File[];
    }
  ) {
    const fileOptions = {
      documentImage: files.documentImage?.[0],
      idCardFrontImage: files.idCardFrontImage?.[0],
      idCardBackImage: files.idCardBackImage?.[0],
      guarantorIdFrontImage: files.guarantorIdFrontImage?.[0],
      guarantorIdBackImage: files.guarantorIdBackImage?.[0],
      guarantorSignatureImage: files.guarantorSignatureImage?.[0],
    };

    return this.service
      .create(req.user, body, fileOptions)
      .then((data) => ({ success: true, data }));
  }

  @Post(":id/send-whatsapp")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  sendWhatsApp(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.service.sendWhatsApp(id, req.user).then((data) => ({ success: true, data }));
  }

  @Post(":id/send-for-review")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  sendForReview(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.service.sendForReview(id, req.user).then((data) => ({ success: true, data }));
  }
}

import {
  Inject,
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Req,
  ParseFilePipeBuilder,
  HttpStatus,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { RequirePermission } from "../auth/decorators/permissions.decorator.js";
import { Resource, Action } from "@motorcycle-system/shared-types";
import { StorageService } from "./storage.service.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import 'multer';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

@Controller("upload")
export class UploadController {
  constructor(@Inject(StorageService) private readonly storageService: StorageService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.MOTORCYCLE, Action.CREATE)
  @UseInterceptors(FileInterceptor("file"))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(jpeg|jpg|png|webp)$/i,
        })
        .addMaxSizeValidator({
          maxSize: MAX_FILE_SIZE,
        })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY, // 422
          fileIsRequired: true,
        })
    )
    file: Express.Multer.File
  ) {
    const result = await this.storageService.uploadFile(file);
    return {
      success: true,
      data: {
        url: result.url,
        filename: result.filename,
        size: file.size,
        mimeType: file.mimetype,
      },
    };
  }

  @Post("customer")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("file"))
  async uploadCustomerFile(
    @Req() request: any,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(jpeg|jpg|png|webp)$/i })
        .addMaxSizeValidator({ maxSize: MAX_FILE_SIZE })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY, fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    if (!request.user?.isCustomer) {
      throw new ForbiddenException({ code: "CUSTOMER_AUTH_REQUIRED", message: "Customer authentication required" });
    }
    const result = await this.storageService.uploadFile(file);
    return { success: true, data: { url: result.url, filename: result.filename, size: file.size, mimeType: file.mimetype } };
  }
}

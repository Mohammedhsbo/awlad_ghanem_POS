import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { AppError } from "../common/errors/app-error.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import {
  DesktopPermissionsService,
  type PagePermission,
} from "./desktop-permissions.service.js";

@Controller("desktop-permissions")
@UseGuards(JwtAuthGuard)
export class DesktopPermissionsController {
  constructor(
    @Inject(DesktopPermissionsService)
    private readonly service: DesktopPermissionsService,
  ) {}

  /** GET /desktop-permissions/me — any authenticated staff user */
  @Get("me")
  async getMyPermissions(@Request() req: AuthenticatedRequest) {
    if (req.user.isCustomer) {
      throw new AppError("FORBIDDEN", 403, "Customers cannot use the desktop");
    }
    const data = await this.service.getForUser(req.user.id);
    return { success: true, data };
  }

  /** GET /desktop-permissions/:userId — super_admin only */
  @Get(":userId")
  async getForUser(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.isSuperAdmin) {
      throw new AppError("FORBIDDEN", 403, "Only super_admin can view user permissions");
    }
    const data = await this.service.getForUser(userId);
    return { success: true, data };
  }

  /** PUT /desktop-permissions/:userId — super_admin only */
  @Put(":userId")
  async setForUser(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() body: { permissions: PagePermission[] },
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.isSuperAdmin) {
      throw new AppError("FORBIDDEN", 403, "Only super_admin can set user permissions");
    }
    const data = await this.service.setForUser(userId, body.permissions ?? []);
    return { success: true, data };
  }

  /** DELETE /desktop-permissions/:userId/reset — super_admin only */
  @Delete(":userId/reset")
  async resetForUser(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.isSuperAdmin) {
      throw new AppError("FORBIDDEN", 403, "Only super_admin can reset permissions");
    }
    await this.service.resetForUser(userId);
    return { success: true };
  }
}

import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Action, Resource } from "@motorcycle-system/shared-types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import { RequirePermission } from "../auth/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { CustomerFinancingService } from "./customer-financing.service.js";
import {
  financingCompanyCreateSchema,
  financingCompanyUpdateSchema,
  installmentDurationCreateSchema,
  installmentDurationUpdateSchema,
  installmentRequestCreateSchema,
  installmentRequestReviewSchema,
  installmentRequestUpdateSchema,
  installmentCalculationSchema,
  settingsUpdateSchema,
} from "./customer-financing.schemas.js";

@Controller()
export class CustomerFinancingController {
  constructor(private readonly service: CustomerFinancingService) {}

  @Get("financing-companies")
  listCompanies() { return this.service.listCompanies().then(data => ({ success: true, data })); }

  @Get("installment-durations")
  listDurations() { return this.service.listDurations().then(data => ({ success: true, data })); }

  @Get("store-settings")
  getSettings() { return this.service.getSettings().then(data => ({ success: true, data })); }

  @Post("installment-calculations")
  calculate(@Body(new ZodValidationPipe(installmentCalculationSchema)) body: any) {
    return this.service.calculate(body).then((data) => ({ success: true, data }));
  }

  @Post("installment-requests")
  @UseGuards(JwtAuthGuard)
  createRequest(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(installmentRequestCreateSchema)) body: unknown) {
    if (!req.user.isCustomer || !req.user.customerId) throw new Error("Customer authentication required");
    return this.service.createRequest(req.user.customerId, body as any).then((data) => ({ success: true, data }));
  }

  @Get("installment-requests/mine")
  @UseGuards(JwtAuthGuard)
  mine(@Req() req: AuthenticatedRequest) {
    if (!req.user.isCustomer || !req.user.customerId) throw new Error("Customer authentication required");
    return this.service.listMine(req.user.customerId).then((data) => ({ success: true, data }));
  }

  @Get("admin/financing-companies")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.SETTING, Action.READ)
  listAllCompanies() { return this.service.listAllCompanies().then((data) => ({ success: true, data })); }

  @Post("admin/financing-companies")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.SETTING, Action.CREATE)
  createCompany(@Body(new ZodValidationPipe(financingCompanyCreateSchema)) body: any) { return this.service.createCompany(body).then((data) => ({ success: true, data })); }

  @Patch("admin/financing-companies/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.SETTING, Action.UPDATE)
  updateCompany(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(financingCompanyUpdateSchema)) body: any) { return this.service.updateCompany(id, body).then((data) => ({ success: true, data })); }

  @Delete("admin/financing-companies/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.SETTING, Action.DELETE)
  deleteCompany(@Param("id", ParseUUIDPipe) id: string) { return this.service.deleteCompany(id).then((data) => ({ success: true, data })); }

  @Get("admin/installment-durations")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.SETTING, Action.READ)
  listAllDurations() { return this.service.listAllDurations().then((data) => ({ success: true, data })); }

  @Post("admin/installment-durations")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.SETTING, Action.CREATE)
  createDuration(@Body(new ZodValidationPipe(installmentDurationCreateSchema)) body: any) { return this.service.createDuration(body).then((data) => ({ success: true, data })); }

  @Patch("admin/installment-durations/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.SETTING, Action.UPDATE)
  updateDuration(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(installmentDurationUpdateSchema)) body: any) { return this.service.updateDuration(id, body).then((data) => ({ success: true, data })); }

  @Delete("admin/installment-durations/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.SETTING, Action.DELETE)
  deleteDuration(@Param("id", ParseUUIDPipe) id: string) { return this.service.deleteDuration(id).then((data) => ({ success: true, data })); }

  @Patch("admin/store-settings")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.SETTING, Action.UPDATE)
  updateSettings(@Body(new ZodValidationPipe(settingsUpdateSchema)) body: any) { return this.service.upsertSettings(body).then((data) => ({ success: true, data })); }

  @Get("admin/installment-requests")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.INSTALLMENT, Action.READ)
  listRequests(@Query("status") status?: "pending" | "approved" | "rejected") { return this.service.listRequests(status).then((data) => ({ success: true, data })); }

  @Get("admin/installment-requests/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.INSTALLMENT, Action.READ)
  getRequest(@Param("id", ParseUUIDPipe) id: string) { return this.service.getRequest(id).then((data) => ({ success: true, data })); }

  @Patch("admin/installment-requests/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.INSTALLMENT, Action.APPROVE)
  reviewRequest(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(installmentRequestReviewSchema)) body: any) { return this.service.reviewRequest(id, body).then((data) => ({ success: true, data })); }

  @Patch("admin/installment-requests/:id/details")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.INSTALLMENT, Action.UPDATE)
  updateRequest(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(installmentRequestUpdateSchema)) body: any) { return this.service.updateRequest(id, body).then((data) => ({ success: true, data })); }

  @Delete("admin/installment-requests/:id")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.INSTALLMENT, Action.DELETE)
  deleteRequest(@Param("id", ParseUUIDPipe) id: string) { return this.service.deleteRequest(id).then((data) => ({ success: true, data })); }

  @Get("admin/installment-requests/:id/whatsapp")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.INSTALLMENT, Action.READ)
  whatsappRequest(@Param("id", ParseUUIDPipe) id: string) { return this.service.whatsappRequest(id).then((data) => ({ success: true, data })); }
}

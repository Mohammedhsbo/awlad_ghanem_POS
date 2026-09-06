import {
  Inject,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import {
  InvoiceStatus,
  PaymentStatus,
  Resource,
  Action,
} from "@motorcycle-system/shared-types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import { RequirePermission } from "../auth/decorators/permissions.decorator.js";
import { AppError } from "../common/errors/app-error.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { CustomersFinancialService } from "./customers-financial.service.js";

function parseFinancialFilters<TStatus extends InvoiceStatus | PaymentStatus>(
  status: TStatus | undefined,
  fromDate: string | undefined,
  toDate: string | undefined,
  page: string | undefined,
  limit: string | undefined,
) {
  return {
    status,
    fromDate: fromDate ? new Date(fromDate) : undefined,
    toDate: toDate ? new Date(toDate) : undefined,
    page: page ? parseInt(page) : undefined,
    limit: limit ? parseInt(limit) : undefined,
  };
}

@Controller("customers/:customerId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersFinancialController {
  constructor(
    @Inject(CustomersFinancialService) private readonly customersFinancialService: CustomersFinancialService
  ) {}

  @Get("invoices")
  @RequirePermission(Resource.INVOICES, Action.READ)
  async getCustomerInvoices(
    @Req() req: AuthenticatedRequest,
    @Param("customerId") customerId: string,
    @Query("status") status?: InvoiceStatus,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.customersFinancialService.getCustomerInvoices(
      customerId,
      parseFinancialFilters(status, fromDate, toDate, page, limit),
      req.user.id,
      req.user.branchId,
      req.user.isSuperAdmin,
      req.user.isCustomer,
      req.user.customerId
    );
  }

  @Get("payments")
  @RequirePermission(Resource.PAYMENTS, Action.READ)
  async getCustomerPayments(
    @Req() req: AuthenticatedRequest,
    @Param("customerId") customerId: string,
    @Query("status") status?: PaymentStatus,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.customersFinancialService.getCustomerPayments(
      customerId,
      parseFinancialFilters(status, fromDate, toDate, page, limit),
      req.user.id,
      req.user.branchId,
      req.user.isSuperAdmin,
      req.user.isCustomer,
      req.user.customerId
    );
  }

  @Get("financial-summary")
  @RequirePermission(Resource.INVOICES, Action.READ)
  async getCustomerFinancialSummary(
    @Param("customerId") customerId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.customersFinancialService.getCustomerFinancialSummary(
      customerId,
      req.user.id,
      req.user.branchId,
      req.user.isSuperAdmin,
      req.user.isCustomer,
      req.user.customerId
    );
  }
}

@Controller("customers/me")
@UseGuards(JwtAuthGuard)
export class CustomerSelfFinancialController {
  constructor(
    @Inject(CustomersFinancialService) private readonly customersFinancialService: CustomersFinancialService
  ) {}

  private getAuthenticatedCustomerId(req: AuthenticatedRequest) {
    if (!req.user.isCustomer || !req.user.customerId) {
      throw new AppError("CUSTOMER_CONTEXT_REQUIRED", 403, "Authenticated customer context is required");
    }

    return req.user.customerId;
  }

  @Get("invoices")
  async getMyInvoices(
    @Req() req: AuthenticatedRequest,
    @Query("status") status?: InvoiceStatus,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const customerId = this.getAuthenticatedCustomerId(req);
    return this.customersFinancialService.getCustomerInvoices(
      customerId,
      parseFinancialFilters(status, fromDate, toDate, page, limit),
      req.user.id,
      req.user.branchId,
      req.user.isSuperAdmin,
      req.user.isCustomer,
      req.user.customerId
    );
  }

  @Get("payments")
  async getMyPayments(
    @Req() req: AuthenticatedRequest,
    @Query("status") status?: PaymentStatus,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const customerId = this.getAuthenticatedCustomerId(req);
    return this.customersFinancialService.getCustomerPayments(
      customerId,
      parseFinancialFilters(status, fromDate, toDate, page, limit),
      req.user.id,
      req.user.branchId,
      req.user.isSuperAdmin,
      req.user.isCustomer,
      req.user.customerId
    );
  }

  @Get("financial-summary")
  async getMyFinancialSummary(@Req() req: AuthenticatedRequest) {
    const customerId = this.getAuthenticatedCustomerId(req);
    return this.customersFinancialService.getCustomerFinancialSummary(
      customerId,
      req.user.id,
      req.user.branchId,
      req.user.isSuperAdmin,
      req.user.isCustomer,
      req.user.customerId
    );
  }
}

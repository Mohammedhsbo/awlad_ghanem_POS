import {
  Inject,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  Action,
  Resource,
  registerCustomerSchema,
  createCustomerSchema,
  updateCustomerSchema,
  changeCustomerPasswordSchema,
  deactivateCustomerSchema,
  listCustomersQuerySchema,
  customerSearchSchema,
  createAddressSchema,
  updateAddressSchema,
  type RegisterCustomerDto,
  type CreateCustomerDto,
  type UpdateCustomerDto,
  type ChangeCustomerPasswordDto,
  type DeactivateCustomerDto,
  type ListCustomersQuery,
  type CustomerSearchDto,
  type CreateAddressDto,
  type UpdateAddressDto,
} from "@motorcycle-system/shared-types";
import { RequirePermission } from "../auth/decorators/permissions.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { CustomersService } from "./customers.service.js";
import { OrdersService } from "../orders/orders.service.js";

@Controller("customers")
export class CustomersController {
  constructor(
    @Inject(CustomersService) private readonly customersService: CustomersService,
    @Inject(OrdersService) private readonly ordersService: OrdersService,
  ) {}

  @Post("register")
  async register(
    @Body(new ZodValidationPipe(registerCustomerSchema)) body: RegisterCustomerDto,
  ) {
    return {
      success: true,
      data: await this.customersService.register(body),
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.CUSTOMER, Action.CREATE)
  async create(
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.customersService.create(body, request.user),
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.CUSTOMER, Action.READ)
  async list(
    @Query(new ZodValidationPipe(listCustomersQuerySchema)) query: ListCustomersQuery,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.customersService.list(query, request.user);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get("search")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.CUSTOMER, Action.READ)
  async search(
    @Query(new ZodValidationPipe(customerSearchSchema)) query: CustomerSearchDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.customersService.search(query.q, query.limit),
    };
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  async getById(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.customersService.getById(id, request.user),
    };
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.customersService.update(id, body, request.user),
    };
  }

  @Post(":id/change-password")
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeCustomerPasswordSchema)) body: ChangeCustomerPasswordDto,
    @Req() request: AuthenticatedRequest,
  ) {
    // Customers can only change their own password
    if (request.user.id !== id) {
      throw new Error("FORBIDDEN");
    }

    await this.customersService.changePassword(id, body, request.user.id, request.user.isCustomer);
    return {
      success: true,
      data: null,
    };
  }

  @Post(":id/deactivate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.CUSTOMER, Action.DELETE)
  async deactivate(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(deactivateCustomerSchema)) body: DeactivateCustomerDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.customersService.deactivate(id, body, request.user);
    return {
      success: true,
      data: null,
    };
  }

  @Post(":id/reactivate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.CUSTOMER, Action.UPDATE)
  async reactivate(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.customersService.reactivate(id, request.user);
    return {
      success: true,
      data: null,
    };
  }

  // Address Management

  @Post(":id/addresses")
  @UseGuards(JwtAuthGuard)
  async addAddress(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createAddressSchema)) body: CreateAddressDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.customersService.addAddress(id, body, request.user),
    };
  }

  @Get(":id/addresses")
  @UseGuards(JwtAuthGuard)
  async listAddresses(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.customersService.listAddresses(id, request.user),
    };
  }

  @Patch(":customerId/addresses/:id")
  @UseGuards(JwtAuthGuard)
  async updateAddress(
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAddressSchema)) body: UpdateAddressDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.customersService.updateAddress(customerId, id, body, request.user),
    };
  }

  @Post(":customerId/addresses/:id/set-default")
  @UseGuards(JwtAuthGuard)
  async setDefaultAddress(
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.customersService.updateAddress(customerId, id, { isDefault: true }, request.user),
    };
  }

  @Delete(":customerId/addresses/:id")
  @UseGuards(JwtAuthGuard)
  async deleteAddress(
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.customersService.deleteAddress(customerId, id, request.user);
    return {
      success: true,
      data: null,
    };
  }

  // Customer Summary

  @Get(":id/summary")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.CUSTOMER, Action.READ)
  async getSummary(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.customersService.getSummary(id, request.user),
    };
  }

  // Customer Orders

  @Get(":id/orders")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.ORDER, Action.READ)
  async getOrders(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: any,
    @Req() request: AuthenticatedRequest,
  ) {
    const isCustomer = request.user.roleName === 'customer';
    const isSuperAdmin = request.user.roleName === 'super_admin';

    // Customers can only view their own orders
    if (isCustomer && request.user.id !== id) {
      throw new Error("FORBIDDEN");
    }

    const result = await this.ordersService.findAll(
      { ...query, customerId: id },
      request.user.id,
      request.user.branchId,
      isSuperAdmin,
      isCustomer,
      isCustomer ? request.user.id : undefined
    );

    return {
      success: true,
      ...result,
    };
  }

  // TASK-008: Customer Financing API

  @Get(":id/financing-summary")
  @UseGuards(JwtAuthGuard)
  async getFinancingSummary(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.customersService.getFinancingSummary(id, request.user),
    };
  }

  @Get(":id/financing-contracts")
  @UseGuards(JwtAuthGuard)
  async getFinancingContracts(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: any,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.customersService.getFinancingContracts(id, query, request.user);
    return {
      success: true,
      ...result,
    };
  }
}

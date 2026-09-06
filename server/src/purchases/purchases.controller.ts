import {
  Inject,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PurchasesService } from './purchases.service.js';
import {
  CreatePurchaseRequest,
  UpdatePurchaseRequest,
  ReceivePurchaseRequest,
  createPurchaseSchema,
  updatePurchaseSchema,
  receivePurchaseSchema,
  Resource,
  Action,
} from '@motorcycle-system/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.js';
import { ApiDocumentation } from '../common/decorators/api-documentation.decorator.js';

@Controller('purchases')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchasesController {
  constructor(@Inject(PurchasesService) private readonly purchasesService: PurchasesService) { }

  @Post()
  @RequirePermission(Resource.PURCHASE, Action.CREATE)
  @ApiDocumentation({ tags: ['Admin - Purchases'], summary: 'Create a purchase', description: 'Admin creates a purchase order for supplier inventory.', protected: true })
  async create(
    @Body(new ZodValidationPipe(createPurchaseSchema)) data: CreatePurchaseRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const isSuperAdmin = req.user.isSuperAdmin;
    const purchase = await this.purchasesService.create(data, req.user.id, req.user.branchId, isSuperAdmin);
    return { success: true, data: purchase };
  }

  @Get()
  @RequirePermission(Resource.PURCHASE, Action.READ)
  @ApiDocumentation({ tags: ['Admin - Purchases'], summary: 'List purchases', description: 'Admin lists purchase orders with branch and status filters.', protected: true })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('supplierId') supplierId?: string,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const isSuperAdmin = req.user.isSuperAdmin;
    const result = await this.purchasesService.findAll({
      page, limit, search, supplierId, branchId, status, startDate, endDate,
      userBranchId: req.user.branchId,
      isSuperAdmin,
    });
    return { success: true, data: result.items, meta: result.meta };
  }

  @Get(':id')
  @RequirePermission(Resource.PURCHASE, Action.READ)
  @ApiDocumentation({ tags: ['Admin - Purchases'], summary: 'Get a purchase', description: 'Admin retrieves a purchase order by ID.', protected: true })
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const isSuperAdmin = req.user.isSuperAdmin;
    const purchase = await this.purchasesService.findOne(id, req.user.branchId, isSuperAdmin);
    return { success: true, data: purchase };
  }

  @Patch(':id')
  @RequirePermission(Resource.PURCHASE, Action.UPDATE)
  @ApiDocumentation({ tags: ['Admin - Purchases'], summary: 'Update a purchase', description: 'Admin updates a purchase order.', protected: true })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePurchaseSchema)) data: UpdatePurchaseRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const isSuperAdmin = req.user.isSuperAdmin;
    const purchase = await this.purchasesService.update(id, data, req.user.id, req.user.branchId, isSuperAdmin);
    return { success: true, data: purchase };
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Resource.PURCHASE, Action.UPDATE)
  @ApiDocumentation({ tags: ['Admin - Purchases'], summary: 'Receive a purchase', description: 'Admin records receipt of a supplier purchase.', protected: true })
  async receive(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(receivePurchaseSchema)) data: ReceivePurchaseRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const isSuperAdmin = req.user.isSuperAdmin;
    const result = await this.purchasesService.receive(id, data, req.user.id, req.user.branchId, isSuperAdmin);
    return { success: true, data: result };
  }

  @Post(':id/order')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Resource.PURCHASE, Action.UPDATE)
  @ApiDocumentation({ tags: ['Admin - Purchases'], summary: 'Place a purchase order', description: 'Admin sends a purchase order to its ordering state.', protected: true })
  async order(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const isSuperAdmin = req.user.isSuperAdmin;
    const result = await this.purchasesService.order(id, req.user.id, req.user.branchId, isSuperAdmin);
    return { success: true, data: result };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Resource.PURCHASE, Action.DELETE)
  @ApiDocumentation({ tags: ['Admin - Purchases'], summary: 'Cancel a purchase', description: 'Admin cancels a purchase order.', protected: true })
  async cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const isSuperAdmin = req.user.isSuperAdmin;
    await this.purchasesService.cancel(id, req.user.id, req.user.branchId, isSuperAdmin);
    return { success: true, data: null };
  }

  @Delete(':id')
  @RequirePermission(Resource.PURCHASE, Action.DELETE)
  @ApiDocumentation({ tags: ['Admin - Purchases'], summary: 'Remove a purchase', description: 'Admin removes a purchase order.', protected: true })
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const isSuperAdmin = req.user.isSuperAdmin;
    await this.purchasesService.remove(id, req.user.id, req.user.branchId, isSuperAdmin);
    return { success: true, data: null };
  }
}

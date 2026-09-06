import {
  Inject,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseUUIDPipe,
  Delete,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { MotorcyclesService } from './motorcycles.service.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import { Resource, Action } from '@motorcycle-system/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.js';
import { ApiDocumentation } from '../common/decorators/api-documentation.decorator.js';
import { 
  createMotorcycleRequestSchema, 
  updateMotorcycleRequestSchema,
  statusTransitionRequestSchema,
  listMotorcyclesQuerySchema,
  CreateMotorcycleRequest,
  UpdateMotorcycleRequest,
  StatusTransitionRequest,
  ListMotorcyclesQuery
} from '@motorcycle-system/shared-types';

@Controller('motorcycles')
export class MotorcyclesController {
  constructor(@Inject(MotorcyclesService) private readonly motorcyclesService: MotorcyclesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.MOTORCYCLE, Action.CREATE)
  @ApiDocumentation({ tags: ['Admin - Motorcycles'], summary: 'Create a motorcycle', description: 'Admin creates a motorcycle record for inventory management.', protected: true })
  async create(
    @Body(new ZodValidationPipe(createMotorcycleRequestSchema)) data: CreateMotorcycleRequest,
    @Req() req: AuthenticatedRequest
  ) {
    const isSuperAdmin = req.user.isSuperAdmin;
    const result = await this.motorcyclesService.create(data, req.user.id, req.user.branchId, isSuperAdmin);
    return { success: true, data: result };
  }

  @Get()
  @ApiDocumentation({ tags: ['Web - Motorcycles', 'POS - Inventory Lookup'], summary: 'List motorcycles', description: 'Web storefront and Desktop POS retrieve motorcycles for browsing or inventory lookup.' })
  // This endpoint might be public for customers (e-commerce) or authenticated for staff
  // Using an optional auth guard would be ideal, but for simplicity we assume it's publicly accessible
  // and we identify the user if token is present, else treat as customer.
  // Assuming a custom decorator or checking req.user manually. We'll use a basic approach.
  async findAll(
    @Query(new ZodValidationPipe(listMotorcyclesQuerySchema)) query: ListMotorcyclesQuery,
    @Req() req: any // req.user might be populated by a global middleware or auth guard if we make it optional
  ) {
    const isCustomer = !req.user || req.user.roleName === 'customer';
    const userBranchId = req.user?.branchId ?? null;
    const isSuperAdmin = req.user?.isSuperAdmin ?? false;
    
    const { items, meta } = await this.motorcyclesService.findAll(query, userBranchId, isSuperAdmin, isCustomer);
    return { success: true, data: items, meta };
  }

  @Get(':id')
  @ApiDocumentation({ tags: ['Web - Motorcycles', 'POS - Inventory Lookup'], summary: 'Get a motorcycle', description: 'Web storefront and Desktop POS retrieve motorcycle details by ID.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const isCustomer = !req.user || req.user.roleName === 'customer';
    const userBranchId = req.user?.branchId ?? null;
    const isSuperAdmin = req.user?.isSuperAdmin ?? false;

    const result = await this.motorcyclesService.findOne(id, userBranchId, isSuperAdmin, isCustomer);
    return { success: true, data: result };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.MOTORCYCLE, Action.UPDATE)
  @ApiDocumentation({ tags: ['Admin - Motorcycles'], summary: 'Update a motorcycle', description: 'Admin updates motorcycle inventory data.', protected: true })
  async update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body(new ZodValidationPipe(updateMotorcycleRequestSchema)) data: UpdateMotorcycleRequest,
    @Req() req: AuthenticatedRequest
  ) {
    const isSuperAdmin = req.user.isSuperAdmin;
    const result = await this.motorcyclesService.update(id, data, req.user.id, req.user.branchId, isSuperAdmin);
    return { success: true, data: result };
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.MOTORCYCLE, Action.UPDATE)
  @ApiDocumentation({ tags: ['Admin - Motorcycles'], summary: 'Change motorcycle status', description: 'Admin changes the lifecycle status of a motorcycle.', protected: true })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(statusTransitionRequestSchema)) data: StatusTransitionRequest,
    @Req() req: AuthenticatedRequest
  ) {
    const isSuperAdmin = req.user.isSuperAdmin;
    const result = await this.motorcyclesService.updateStatus(id, data.status, data.reason, req.user.id, req.user.branchId, isSuperAdmin);
    return { success: true, data: result };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.MOTORCYCLE, Action.DELETE)
  @ApiDocumentation({ tags: ['Admin - Motorcycles'], summary: 'Remove a motorcycle', description: 'Admin removes a motorcycle from inventory.', protected: true })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    const isSuperAdmin = req.user.isSuperAdmin;
    await this.motorcyclesService.remove(id, req.user.id, req.user.branchId, isSuperAdmin);
    return { success: true, data: null };
  }
}

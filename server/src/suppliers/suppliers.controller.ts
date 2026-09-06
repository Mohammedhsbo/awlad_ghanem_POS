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
  ParseBoolPipe,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service.js';
import { 
  CreateSupplierRequest, 
  UpdateSupplierRequest,
  createSupplierSchema,
  updateSupplierSchema,
  Resource,
  Action,
} from '@motorcycle-system/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ApiDocumentation } from '../common/decorators/api-documentation.decorator.js';

@Controller('suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
  constructor(@Inject(SuppliersService) private readonly suppliersService: SuppliersService) {}

  @Post()
  @RequirePermission(Resource.SUPPLIER, Action.CREATE)
  @ApiDocumentation({ tags: ['Admin - Suppliers'], summary: 'Create a supplier', description: 'Admin creates a supplier record.', protected: true })
  async create(
    @Body(new ZodValidationPipe(createSupplierSchema)) data: CreateSupplierRequest
  ) {
    const supplier = await this.suppliersService.create(data);
    return { success: true, data: supplier };
  }

  @Get()
  @RequirePermission(Resource.SUPPLIER, Action.READ)
  @ApiDocumentation({ tags: ['Admin - Suppliers'], summary: 'List suppliers', description: 'Admin lists suppliers with optional filtering.', protected: true })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('isActive', new DefaultValuePipe(undefined), new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    const result = await this.suppliersService.findAll({ page, limit, search, isActive });
    return { success: true, data: result.items, meta: result.meta };
  }

  @Get(':id')
  @RequirePermission(Resource.SUPPLIER, Action.READ)
  @ApiDocumentation({ tags: ['Admin - Suppliers'], summary: 'Get a supplier', description: 'Admin retrieves supplier details by ID.', protected: true })
  async findOne(@Param('id') id: string) {
    const supplier = await this.suppliersService.findOne(id);
    return { success: true, data: supplier };
  }

  @Patch(':id')
  @RequirePermission(Resource.SUPPLIER, Action.UPDATE)
  @ApiDocumentation({ tags: ['Admin - Suppliers'], summary: 'Update a supplier', description: 'Admin updates supplier information.', protected: true })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupplierSchema)) data: UpdateSupplierRequest
  ) {
    const supplier = await this.suppliersService.update(id, data);
    return { success: true, data: supplier };
  }

  @Delete(':id')
  @RequirePermission(Resource.SUPPLIER, Action.DELETE)
  @ApiDocumentation({ tags: ['Admin - Suppliers'], summary: 'Remove a supplier', description: 'Admin removes a supplier.', protected: true })
  async remove(@Param('id') id: string) {
    await this.suppliersService.remove(id);
    return { success: true, data: null };
  }
}

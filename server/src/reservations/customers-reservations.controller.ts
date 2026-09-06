import {
  Inject,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import { Resource, Action } from '@motorcycle-system/shared-types';

@Controller('customers/:customerId/reservations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(@Inject(ReservationsService) private readonly reservationsService: ReservationsService) {}

  /**
   * TASK-005: Get customer reservations
   * GET /api/v1/customers/:customerId/reservations
   */
  @Get()
  @RequirePermission(Resource.RESERVATION, Action.READ)
  async findByCustomer(
    @Param('customerId') customerId: string,
    @Query() query: any,
    @Request() req: any,
  ) {
    const userId = req.user.id;
    const isSuperAdmin = req.user.isSuperAdmin ?? false;
    const isCustomer = req.user.isCustomer ?? false;

    const result = await this.reservationsService.findByCustomer(customerId, {
      page: query.page ? parseInt(query.page) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
      status: query.status,
      userId,
      isSuperAdmin,
      isCustomer,
    });

    return {
      success: true,
      data: result.items,
      meta: result.meta,
    };
  }
}

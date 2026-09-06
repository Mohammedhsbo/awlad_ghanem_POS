import {
  Inject,
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import {
  CreateOrderDto,
  Resource,
  Action,
  ListOrdersQuery,
  listOrdersQuerySchema,
  ChangeOrderStatusDto,
  UpdateOrderDto,
  CancelOrderDto,
} from '@motorcycle-system/shared-types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.ORDER, Action.CREATE)
  async create(@Body() createOrderDto: CreateOrderDto, @Req() req: any) {
    const user = req.user;
    const isCustomer = user.roleName === 'customer';
    const isSuperAdmin = user.roleName === 'super_admin';

    // For customers, override customerId with their own ID
    if (isCustomer) {
      createOrderDto.customerId = user.id;
    }

    return {
      success: true,
      data: await this.ordersService.create(
        createOrderDto,
        user.id,
        user.branchId,
        isSuperAdmin,
        isCustomer
      ),
    };
  }

  @Post(':id/confirm')
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.ORDER, Action.UPDATE)
  async confirm(@Param('id') id: string, @Req() req: any) {
    const user = req.user;
    const isSuperAdmin = user.roleName === 'super_admin';

    return {
      success: true,
      data: await this.ordersService.confirm(
        id,
        user.id,
        user.branchId,
        isSuperAdmin
      ),
    };
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.ORDER, Action.READ)
  async findAll(
    @Query(new ZodValidationPipe(listOrdersQuerySchema)) query: ListOrdersQuery,
    @Req() req: any,
  ) {
    const user = req.user;
    const isCustomer = user.roleName === 'customer';
    const isSuperAdmin = user.roleName === 'super_admin';

    const result = await this.ordersService.findAll(
      query,
      user.id,
      user.branchId,
      isSuperAdmin,
      isCustomer,
      isCustomer ? user.id : undefined
    );

    return {
      success: true,
      ...result,
    };
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.ORDER, Action.READ)
  async findOne(@Param('id') id: string, @Req() req: any) {
    const user = req.user;
    const isCustomer = user.roleName === 'customer';
    const isSuperAdmin = user.roleName === 'super_admin';

    return {
      success: true,
      data: await this.ordersService.findOne(
        id,
        user.id,
        user.branchId,
        isSuperAdmin,
        isCustomer,
        isCustomer ? user.id : undefined
      ),
    };
  }

  @Post(':id/status')
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.ORDER, Action.UPDATE)
  async changeStatus(
    @Param('id') id: string,
    @Body() body: ChangeOrderStatusDto,
    @Req() req: any
  ) {
    const user = req.user;
    const isSuperAdmin = user.roleName === 'super_admin';

    return {
      success: true,
      data: await this.ordersService.changeStatus(
        id,
        body.status,
        body.reason,
        user.id,
        user.branchId,
        isSuperAdmin
      ),
    };
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.ORDER, Action.UPDATE)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateOrderDto,
    @Req() req: any
  ) {
    const user = req.user;
    const isSuperAdmin = user.roleName === 'super_admin';

    return {
      success: true,
      data: await this.ordersService.update(
        id,
        body,
        user.id,
        user.branchId,
        isSuperAdmin
      ),
    };
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancel(
    @Param('id') id: string,
    @Body() body: CancelOrderDto,
    @Req() req: any
  ) {
    const user = req.user;
    const isCustomer = user.roleName === 'customer';
    const isSuperAdmin = user.roleName === 'super_admin';

    // Manual permission check for staff to not relax the rule
    if (!isCustomer && !isSuperAdmin) {
      const hasPermission = user.permissions?.some(
        (p: any) => p.resource === Resource.ORDER && p.action === Action.DELETE
      );
      if (!hasPermission) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    await this.ordersService.cancel(
      id,
      body.reason,
      user.id,
      user.branchId,
      isSuperAdmin,
      isCustomer
    );

    return {
      success: true,
      data: null,
    };
  }

  @Get(':id/history')
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.ORDER, Action.READ)
  async getHistory(@Param('id') id: string, @Req() req: any) {
    const user = req.user;
    const isCustomer = user.roleName === 'customer';
    const isSuperAdmin = user.roleName === 'super_admin';

    return {
      success: true,
      data: await this.ordersService.getHistory(
        id,
        user.id,
        user.branchId,
        isSuperAdmin,
        isCustomer,
        isCustomer ? user.id : undefined
      ),
    };
  }
}



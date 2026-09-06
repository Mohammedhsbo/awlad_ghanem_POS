import {
  Inject,
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import {
  CreateReservationRequest,
  createReservationSchema,
  UpdateReservationRequest,
  updateReservationSchema,
  CancelReservationRequest,
  cancelReservationSchema,
  ExtendReservationRequest,
  extendReservationSchema,
  ConvertReservationRequest,
  convertReservationSchema,
  Resource,
  Action,
} from '@motorcycle-system/shared-types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Controller('reservations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReservationsController {
  constructor(
    @Inject(ReservationsService) private readonly reservationsService: ReservationsService,
    @Inject(NotificationsService) private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * TASK-004: Create new reservation
   * POST /api/v1/reservations
   */
  @Post()
  @RequirePermission(Resource.RESERVATION, Action.CREATE)
  async create(
    @Body(new ZodValidationPipe(createReservationSchema)) data: CreateReservationRequest,
    @Request() req: any,
  ) {
    const userId = req.user.id;
    const userBranchId = req.user.branchId ?? null;
    const isSuperAdmin = req.user.isSuperAdmin ?? false;
    const isCustomer = req.user.isCustomer ?? false;

    const reservation = await this.reservationsService.create(
      data,
      userId,
      userBranchId,
      isSuperAdmin,
      isCustomer,
    );

    return {
      success: true,
      data: reservation,
    };
  }

  /**
   * TASK-005: List reservations
   * GET /api/v1/reservations
   */
  @Get()
  @RequirePermission(Resource.RESERVATION, Action.READ)
  async findAll(@Query() query: any, @Request() req: any) {
    const userId = req.user.id;
    const userBranchId = req.user.branchId ?? null;
    const isSuperAdmin = req.user.isSuperAdmin ?? false;
    const isCustomer = req.user.isCustomer ?? false;

    const result = await this.reservationsService.findAll({
      page: query.page ? parseInt(query.page) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
      search: query.search,
      customerId: query.customerId,
      branchId: query.branchId,
      status: query.status,
      startDate: query.startDate,
      endDate: query.endDate,
      expiringBefore: query.expiringBefore,
      sort: query.sort,
      order: query.order,
      userId,
      userBranchId,
      isSuperAdmin,
      isCustomer,
    });

    return {
      success: true,
      data: result.items,
      meta: result.meta,
    };
  }

  /**
   * TASK-005: Get single reservation
   * GET /api/v1/reservations/:id
   */
  @Get(':id')
  @RequirePermission(Resource.RESERVATION, Action.READ)
  async findOne(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.id;
    const userBranchId = req.user.branchId ?? null;
    const isSuperAdmin = req.user.isSuperAdmin ?? false;
    const isCustomer = req.user.isCustomer ?? false;

    const reservation = await this.reservationsService.findOne(
      id,
      userId,
      userBranchId,
      isSuperAdmin,
      isCustomer,
    );

    return {
      success: true,
      data: reservation,
    };
  }

  @Post(':id/send-whatsapp')
  @RequirePermission(Resource.RESERVATION, Action.UPDATE)
  async sendWhatsApp(@Param('id') id: string, @Request() req: any) {
    const reservation = await this.reservationsService.findOne(id, req.user.id, req.user.branchId ?? null, req.user.isSuperAdmin ?? false, req.user.isCustomer ?? false);
    return {
      success: true,
      data: await this.notificationsService.sendDirectWhatsApp({
        customerId: reservation.customer.id,
        recipient: reservation.customer.phone,
        subject: 'Reservation reminder',
        body: `Reservation ${reservation.reservationNumber} for ${reservation.customer.name}: ${reservation.motorcycle.model}. Paid ${reservation.paidAmount.toFixed(2)}, remaining ${reservation.remainingAmount.toFixed(2)}.`,
      }),
    };
  }

  /**
   * TASK-006: Update reservation
   * PATCH /api/v1/reservations/:id
   */
  @Patch(':id')
  @RequirePermission(Resource.RESERVATION, Action.UPDATE)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateReservationSchema)) data: UpdateReservationRequest,
    @Request() req: any,
  ) {
    const userId = req.user.id;
    const userBranchId = req.user.branchId ?? null;
    const isSuperAdmin = req.user.isSuperAdmin ?? false;

    const reservation = await this.reservationsService.update(
      id,
      data,
      userId,
      userBranchId,
      isSuperAdmin,
    );

    return {
      success: true,
      data: reservation,
    };
  }

  /**
   * TASK-006: Extend reservation expiration
   * POST /api/v1/reservations/:id/extend
   */
  @Post(':id/extend')
  @RequirePermission(Resource.RESERVATION, Action.UPDATE)
  async extend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(extendReservationSchema)) data: ExtendReservationRequest,
    @Request() req: any,
  ) {
    const userId = req.user.id;
    const userBranchId = req.user.branchId ?? null;
    const isSuperAdmin = req.user.isSuperAdmin ?? false;

    const result = await this.reservationsService.extend(
      id,
      data,
      userId,
      userBranchId,
      isSuperAdmin,
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * TASK-007: Cancel reservation
   * POST /api/v1/reservations/:id/cancel
   */
  @Post(':id/cancel')
  @RequirePermission(Resource.RESERVATION, Action.DELETE)
  async cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelReservationSchema)) data: CancelReservationRequest,
    @Request() req: any,
  ) {
    const userId = req.user.id;
    const userBranchId = req.user.branchId ?? null;
    const isSuperAdmin = req.user.isSuperAdmin ?? false;
    const isCustomer = req.user.isCustomer ?? false;

    const result = await this.reservationsService.cancel(
      id,
      data,
      userId,
      userBranchId,
      isSuperAdmin,
      isCustomer,
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * TASK-007: Process expired reservations (background job)
   * POST /api/v1/reservations/expire
   */
  @Post('expire')
  @RequirePermission(Resource.SCHEDULER, Action.UPDATE)
  async processExpired(@Body() body: { limit?: number }) {
    const limit = body.limit ?? 100;

    const result = await this.reservationsService.processExpired(limit);

    return {
      success: true,
      data: result,
    };
  }

  /**
   * TASK-008: Convert reservation to order
   * POST /api/v1/reservations/:id/convert
   */
  @Post(':id/convert')
  @RequirePermission(Resource.RESERVATION, Action.UPDATE)
  async convert(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(convertReservationSchema)) data: ConvertReservationRequest,
    @Request() req: any,
  ) {
    const userId = req.user.id;
    const userBranchId = req.user.branchId ?? null;
    const isSuperAdmin = req.user.isSuperAdmin ?? false;

    const result = await this.reservationsService.convert(
      id,
      data,
      userId,
      userBranchId,
      isSuperAdmin,
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * TASK-009: Get reservation history
   * GET /api/v1/reservations/:id/history
   */
  @Get(':id/history')
  @RequirePermission(Resource.RESERVATION, Action.READ)
  async getHistory(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.id;
    const userBranchId = req.user.branchId ?? null;
    const isSuperAdmin = req.user.isSuperAdmin ?? false;
    const isCustomer = req.user.isCustomer ?? false;

    const history = await this.reservationsService.getHistory(
      id,
      userId,
      userBranchId,
      isSuperAdmin,
      isCustomer,
    );

    return {
      success: true,
      data: history,
    };
  }
}

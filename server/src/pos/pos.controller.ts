import {
  Inject,
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { POSService } from './pos.service.js';
import { OfflineService } from './offline.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  Resource,
  Action,
  posCustomerSearchSchema,
  posMotorcycleSearchSchema,
  validatePOSTransactionSchema,
  createPOSTransactionSchema,
  posActiveReservationsQuerySchema,
  convertPOSReservationSchema,
  queueOfflineOperationSchema,
  type POSCustomerSearchQuery,
  type POSMotorcycleSearchQuery,
  type ValidatePOSTransactionDto,
  type CreatePOSTransactionDto,
  type POSActiveReservationsQuery,
  type ConvertPOSReservationDto,
  type QueueOfflineOperationDto,
} from '@motorcycle-system/shared-types';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.js';
import { ApiDocumentation } from '../common/decorators/api-documentation.decorator.js';

@Controller('pos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class POSController {
  constructor(
    @Inject(POSService) private readonly posService: POSService,
    @Inject(OfflineService) private readonly offlineService: OfflineService,
  ) {}

  @Get('dashboard')
  @RequirePermission(Resource.ORDER, Action.READ)
  @ApiDocumentation({ tags: ['POS - Sales'], summary: 'Get POS dashboard', description: 'Desktop POS loads dashboard data for the current shift and branch.', protected: true })
  async getDashboard(@Req() req: AuthenticatedRequest) {
    const data = await this.posService.getDashboard(req.user);
    return {
      success: true,
      data,
    };
  }

  @Get('customers/search')
  @RequirePermission(Resource.CUSTOMER, Action.READ)
  @ApiDocumentation({ tags: ['POS - Sales'], summary: 'Search POS customers', description: 'Desktop POS searches customers during checkout.', protected: true })
  async searchCustomers(
    @Query(new ZodValidationPipe(posCustomerSearchSchema)) query: POSCustomerSearchQuery,
  ) {
    const data = await this.posService.searchCustomers(query);
    return {
      success: true,
      data,
    };
  }

  @Get('motorcycles/search')
  @RequirePermission(Resource.MOTORCYCLE, Action.READ)
  @ApiDocumentation({ tags: ['POS - Inventory Lookup'], summary: 'Search POS motorcycles', description: 'Desktop POS searches motorcycles during checkout and inventory lookup.', protected: true })
  async searchMotorcycles(
    @Query(new ZodValidationPipe(posMotorcycleSearchSchema)) query: POSMotorcycleSearchQuery,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.posService.searchMotorcycles(query, req.user);
    return {
      success: true,
      data,
    };
  }

  @Post('validate-transaction')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Resource.ORDER, Action.CREATE)
  @ApiDocumentation({ tags: ['POS - Sales'], summary: 'Validate a POS transaction', description: 'Desktop POS validates a transaction before creating the sale.', protected: true })
  async validateTransaction(
    @Body(new ZodValidationPipe(validatePOSTransactionSchema)) dto: ValidatePOSTransactionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.posService.validateTransaction(dto, req.user);
    return {
      success: true,
      data,
    };
  }

  @Post('transactions')
  @RequirePermission(Resource.ORDER, Action.CREATE)
  @ApiDocumentation({ tags: ['POS - Sales'], summary: 'Create a POS transaction', description: 'Desktop POS creates a sale transaction.', protected: true })
  async createTransaction(
    @Body(new ZodValidationPipe(createPOSTransactionSchema)) dto: CreatePOSTransactionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.posService.createTransaction(dto, req.user);
    return {
      success: true,
      data,
    };
  }

  @Post('cash-sales')
  @UseInterceptors(FileInterceptor('customerIdImage'))
  @RequirePermission(Resource.ORDER, Action.CREATE)
  async createCashSale(@Body() body: any, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.posService.createCashSale(body, req.user, file) };
  }

  @Get('reservations/active')
  @RequirePermission(Resource.RESERVATION, Action.READ)
  @ApiDocumentation({ tags: ['POS - Sales'], summary: 'List active reservations', description: 'Desktop POS retrieves reservations eligible for checkout.', protected: true })
  async getActiveReservations(
    @Query(new ZodValidationPipe(posActiveReservationsQuerySchema))
    query: POSActiveReservationsQuery,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.posService.getActiveReservations(query, req.user);
    return {
      success: true,
      data,
    };
  }

  @Get('orders')
  @RequirePermission(Resource.ORDER, Action.READ)
  async listDesktopOrders(@Query() query: any, @Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.posService.listDesktopOrders(query, req.user) };
  }

  @Post('orders')
  @RequirePermission(Resource.ORDER, Action.CREATE)
  async createDesktopOrder(@Body() body: any, @Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.posService.createDesktopOrder(body, req.user) };
  }

  @Get('orders/:id')
  @RequirePermission(Resource.ORDER, Action.READ)
  async getDesktopOrder(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.posService.getDesktopOrder(id, req.user) };
  }

  @Patch('orders/:id/status')
  @RequirePermission(Resource.ORDER, Action.UPDATE)
  async updateDesktopOrderStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: { status: string }, @Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.posService.updateDesktopOrderStatus(id, body.status, req.user) };
  }

  @Post('orders/:id/cancel')
  @RequirePermission(Resource.ORDER, Action.UPDATE)
  async cancelDesktopOrder(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.posService.cancelDesktopOrder(id, req.user) };
  }

  @Get('reservations')
  @RequirePermission(Resource.RESERVATION, Action.READ)
  async listDesktopReservations(@Query() query: any, @Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.posService.listDesktopReservations(query, req.user) };
  }

  @Post('reservations/direct')
  @UseInterceptors(FileInterceptor('customerIdImage'))
  @RequirePermission(Resource.RESERVATION, Action.CREATE)
  async createDirectReservation(
    @Body() body: { customerName: string; customerPhone: string; motorcycleId: string; holdAmount: number },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return { success: true, data: await this.posService.createDirectReservation(body, req.user, file) };
  }

  @Get('reservations/:id')
  @RequirePermission(Resource.RESERVATION, Action.READ)
  async getDesktopReservation(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.posService.getDesktopReservation(id, req.user) };
  }

  @Post('reservations/:id/cancel')
  @RequirePermission(Resource.RESERVATION, Action.UPDATE)
  async cancelDesktopReservation(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.posService.cancelDesktopReservation(id, req.user) };
  }

  @Patch('reservations/:id')
  @RequirePermission(Resource.RESERVATION, Action.UPDATE)
  async updateDesktopReservation(@Param('id', ParseUUIDPipe) id: string, @Body() body: { expiresAt?: string; notes?: string }, @Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.posService.updateDesktopReservation(id, body, req.user) };
  }

  @Post('reservations/:id/convert')
  @RequirePermission(Resource.RESERVATION, Action.UPDATE)
  @ApiDocumentation({ tags: ['POS - Sales'], summary: 'Convert a reservation', description: 'Desktop POS converts an active reservation into a sale.', protected: true })
  async convertReservation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(convertPOSReservationSchema)) dto: ConvertPOSReservationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.posService.convertReservation(id, dto, req.user);
    return {
      success: true,
      data,
    };
  }

  @Get('offline/sync-status')
  @RequirePermission(Resource.ORDER, Action.READ)
  @ApiDocumentation({ tags: ['POS - Shifts'], summary: 'Get offline sync status', description: 'Desktop POS checks the synchronization status of queued offline work.', protected: true })
  async getOfflineSyncStatus(@Req() req: AuthenticatedRequest) {
    const data = await this.offlineService.getSyncStatus(req.user.id);
    return {
      success: true,
      data,
    };
  }

  @Post('offline/queue')
  @RequirePermission(Resource.POS, Action.CREATE)
  @ApiDocumentation({ tags: ['POS - Shifts'], summary: 'Queue an offline operation', description: 'Desktop POS queues an operation while offline.', protected: true })
  async queueOfflineOperation(
    @Body(new ZodValidationPipe(queueOfflineOperationSchema)) dto: QueueOfflineOperationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.offlineService.queueOperation(dto, req.user);
    return {
      success: true,
      data,
    };
  }

  @Get('offline/queue')
  @RequirePermission(Resource.ORDER, Action.READ)
  @ApiDocumentation({ tags: ['POS - Shifts'], summary: 'List queued offline operations', description: 'Desktop POS lists operations waiting for synchronization.', protected: true })
  async getQueuedOperations(@Req() req: AuthenticatedRequest) {
    const data = await this.offlineService.getQueuedOperations(req.user.id);
    return {
      success: true,
      data,
    };
  }
}

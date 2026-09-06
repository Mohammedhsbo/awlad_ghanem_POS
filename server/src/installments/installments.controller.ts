import {
  Inject,
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { InstallmentsService } from './installments.service.js';
import { InstallmentsSchedulerService } from './installments-scheduler.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import { PaymentMethod, Resource, Action } from '@motorcycle-system/shared-types';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.js';

class CreateInstallmentPaymentDto {
  amount: number;
  method: PaymentMethod;
  reference?: string;
  idempotencyKey: string;
  notes?: string;
}

@Controller('installments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InstallmentsController {
  constructor(
    @Inject(InstallmentsService) private readonly installmentsService: InstallmentsService,
    @Inject(InstallmentsSchedulerService) private readonly schedulerService: InstallmentsSchedulerService
  ) {}

  /**
   * POST /api/installments/:id/payments
   * TASK-006: Create payment for an installment
   */
  @Post(':id/payments')
  @RequirePermission(Resource.PAYMENT, Action.CREATE)
  async createPayment(
    @Param('id') id: string,
    @Body() data: CreateInstallmentPaymentDto,
    @Request() req: AuthenticatedRequest
  ) {
    return this.installmentsService.createPayment(
      id,
      data,
      req.user.id,
      req.user.branchId,
      req.user.isSuperAdmin
    );
  }

  /**
   * GET /api/installments/:id
   * Get installment details
   */
  @Get(':id')
  @RequirePermission(Resource.FINANCING_CONTRACT, Action.READ)
  async getInstallment(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.installmentsService.findById(
      id,
      req.user.id,
      req.user.branchId,
      req.user.isSuperAdmin
    );
  }

  @Post(':id/send-whatsapp')
  @RequirePermission(Resource.FINANCING_CONTRACT, Action.UPDATE)
  async sendWhatsApp(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.installmentsService.sendWhatsApp(id, req.user.id, req.user.branchId, req.user.isSuperAdmin);
  }

  /**
   * GET /api/installments/contract/:contractId
   * List installments for a contract
   */
  @Get('contract/:contractId')
  @RequirePermission(Resource.FINANCING_CONTRACT, Action.READ)
  async listByContract(@Param('contractId') contractId: string, @Request() req: AuthenticatedRequest) {
    return this.installmentsService.listByContract(
      contractId,
      req.user.id,
      req.user.branchId,
      req.user.isSuperAdmin
    );
  }

  /**
   * POST /api/installments/status-update
   * TASK-007: Manually trigger status update job
   * For production: set up external cron to call this endpoint hourly
   */
  @Post('status-update')
  @RequirePermission(Resource.FINANCING_CONTRACT, Action.UPDATE)
  async triggerStatusUpdate() {
    return this.schedulerService.handleInstallmentStatusUpdate();
  }
}

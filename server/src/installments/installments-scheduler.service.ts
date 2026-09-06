import { Inject, Injectable, Logger } from '@nestjs/common';
import { InstallmentsService } from './installments.service.js';

/**
 * TASK-007: Background job for installment status management
 * Runs periodic status updates: upcoming → due, due → overdue
 * 
 * NOTE: To enable automatic scheduling, install @nestjs/schedule
 * and add @Cron(CronExpression.EVERY_HOUR) decorator to handleInstallmentStatusUpdate
 * 
 * For now, this can be triggered via API endpoint or external cron job
 */
@Injectable()
export class InstallmentsSchedulerService {
  private readonly logger = new Logger(InstallmentsSchedulerService.name);

  constructor(@Inject(InstallmentsService) private readonly installmentsService: InstallmentsService) {}

  /**
   * Update installment statuses
   * Can be triggered manually via API or external scheduler
   */
  async handleInstallmentStatusUpdate() {
    this.logger.log('Starting installment status update job');

    try {
      const updatedCount = await this.installmentsService.updateStatuses(1000);

      this.logger.log(
        `Installment status update completed: ${updatedCount} installments updated`
      );

      return {
        success: true,
        updatedCount,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Installment status update failed', error);
      throw error;
    }
  }
}

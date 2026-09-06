// SPEC-014: Integrations API Controller

import {
  Inject,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RequirePermission } from '../../auth/decorators/permissions.decorator.js';
import { Resource, Action } from '@motorcycle-system/shared-types';
import { IntegrationService } from '../services/integration.service.js';
import { ProviderHealthService } from '../services/provider-health.service.js';
import { APIResponseInterceptor } from '../interceptors/api-response.interceptor.js';

interface AuthRequest extends Request {
  user: { id: string; branchId?: string };
}

@Controller('admin/integrations')
@UseGuards(JwtAuthGuard)
@UseInterceptors(APIResponseInterceptor)
export class IntegrationsController {
  constructor(
    @Inject(IntegrationService) private readonly integrationService: IntegrationService,
    @Inject(ProviderHealthService) private readonly healthService: ProviderHealthService,
  ) {}

  @Get()
  @RequirePermission(Resource.SETTING, Action.READ)
  async getIntegrations(
    @Query('branchId') branchId?: string,
    @Query('providerId') providerId?: string,
    @Query('isEnabled') isEnabled?: string,
  ) {
    return this.integrationService.getIntegrations(
      branchId,
      providerId,
      isEnabled === 'true' ? true : isEnabled === 'false' ? false : undefined,
    );
  }

  @Get('health')
  @RequirePermission(Resource.SETTING, Action.READ)
  async getHealthOverview() {
    return this.healthService.getSystemHealthOverview();
  }

  @Get(':id')
  @RequirePermission(Resource.SETTING, Action.READ)
  async getIntegration(@Param('id') id: string) {
    return this.integrationService.getIntegration(id);
  }

  @Patch(':id')
  @RequirePermission(Resource.SETTING, Action.UPDATE)
  async updateIntegration(
    @Param('id') id: string,
    @Body() data: { isEnabled?: boolean; configuration?: any },
    @Req() req: AuthRequest,
  ) {
    return this.integrationService.updateIntegration(id, data, req.user.id);
  }

  @Post(':id/test')
  @RequirePermission(Resource.SETTING, Action.UPDATE)
  async testIntegration(@Param('id') id: string) {
    const status = await this.healthService.checkIntegrationHealth(id);
    return { status, tested: true };
  }

  @Get(':id/logs')
  @RequirePermission(Resource.SETTING, Action.READ)
  async getIntegrationLogs(
    @Param('id') id: string,
    @Query('operation') operation?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.integrationService.getIntegrationLogs(id, {
      operation,
      status: status ? parseInt(status, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : 100,
    });
  }

  @Get(':id/metrics')
  @RequirePermission(Resource.SETTING, Action.READ)
  async getIntegrationMetrics(
    @Param('id') id: string,
    @Query('hours') hours?: string,
  ) {
    return this.healthService.getIntegrationMetrics(
      id,
      hours ? parseInt(hours, 10) : 24,
    );
  }
}

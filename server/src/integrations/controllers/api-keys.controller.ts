// SPEC-014: API Keys Controller

import {
  Inject,
  Controller,
  Get,
  Post,
  Delete,
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
import { APIKeyService } from '../services/api-key.service.js';
import { APIResponseInterceptor } from '../interceptors/api-response.interceptor.js';
import { APIKeyScope } from '../types/integration.types.js';

interface AuthRequest extends Request {
  user: { id: string; branchId?: string };
}

@Controller('admin/api-keys')
@UseGuards(JwtAuthGuard)
@UseInterceptors(APIResponseInterceptor)
export class APIKeysController {
  constructor(@Inject(APIKeyService) private readonly apiKeyService: APIKeyService) {}

  @Post()
  @RequirePermission(Resource.SETTING, Action.CREATE)
  async createAPIKey(
    @Body()
    data: {
      description?: string;
      scope: APIKeyScope;
      branchId?: string;
      environment?: string;
      expiresAt?: string;
    },
    @Req() req: AuthRequest,
  ) {
    const result = await this.apiKeyService.createAPIKey({
      ...data,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      createdBy: req.user.id,
    });

    return {
      ...result,
      warning: 'Save this API key now. You will not be able to see it again.',
    };
  }

  @Get()
  @RequirePermission(Resource.SETTING, Action.READ)
  async listAPIKeys(
    @Query('branchId') branchId?: string,
    @Query('environment') environment?: string,
  ) {
    return this.apiKeyService.listAPIKeys(branchId, environment);
  }

  @Delete(':id')
  @RequirePermission(Resource.SETTING, Action.DELETE)
  async revokeAPIKey(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.apiKeyService.revokeAPIKey(id, req.user.id);
    return { revoked: true };
  }
}

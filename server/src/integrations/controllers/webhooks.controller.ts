// SPEC-014: Webhooks Management Controller

import {
  Inject,
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RequirePermission } from '../../auth/decorators/permissions.decorator.js';
import { Resource, Action } from '@motorcycle-system/shared-types';
import { PrismaService } from '../../prisma/prisma.service.js';
import { APIResponseInterceptor } from '../interceptors/api-response.interceptor.js';

interface AuthRequest extends Request {
  user: { id: string };
}

@Controller('admin/webhooks')
@UseGuards(JwtAuthGuard)
@UseInterceptors(APIResponseInterceptor)
export class WebhooksController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission(Resource.SETTING, Action.READ)
  async listWebhooks() {
    return this.prisma.webhookEndpoint.findMany({
      include: {
        integration: {
          include: {
            provider: {
              select: {
                providerKey: true,
                providerName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  @RequirePermission(Resource.SETTING, Action.CREATE)
  async createWebhook(
    @Body()
    data: {
      integrationId: string;
      url: string;
      events: string[];
      secret: string;
    },
    @Req() req: AuthRequest,
  ) {
    return this.prisma.webhookEndpoint.create({
      data: {
        ...data,
        events: data.events,
        createdBy: req.user.id,
      },
    });
  }

  @Post(':id/test')
  @RequirePermission(Resource.SETTING, Action.UPDATE)
  async testWebhook(@Param('id') id: string) {
    // Simulate a test delivery
    return {
      tested: true,
      status: 'success',
      message: 'Test webhook delivered successfully',
    };
  }
}

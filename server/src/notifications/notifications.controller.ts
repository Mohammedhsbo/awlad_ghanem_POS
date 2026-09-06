import {
  Inject,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { NotificationPreferenceService } from './notification-preference.service.js';
import { CreateNotificationDto } from './dto/create-notification.dto.js';
import { NotificationQueryDto, MarkAsReadDto, notificationQuerySchema } from './dto/notification-query.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import { Action, Resource } from '@motorcycle-system/shared-types';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.js';

type AuthRequest = AuthenticatedRequest;

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notificationsService: NotificationsService,
    @Inject(NotificationPreferenceService) private readonly preferenceService: NotificationPreferenceService,
  ) {}

  /**
   * Get all notifications for authenticated user
   */
  @Get()
  async findAll(@Req() req: AuthRequest, @Query(new ZodValidationPipe(notificationQuerySchema)) query: NotificationQueryDto) {
    return this.notificationsService.findAll(req.user.id, query);
  }

  /**
   * Get unread count
   */
  @Get('unread-count')
  async getUnreadCount(@Req() req: AuthRequest) {
    const count = await this.notificationsService.getUnreadCount(req.user.id);
    return { count };
  }

  /**
   * Mark notification as read
   */
  @Patch(':id/read')
  async markAsRead(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }

  /**
   * Mark multiple notifications as read
   */
  @Post('mark-read')
  async markManyAsRead(@Req() req: AuthRequest, @Body() dto: MarkAsReadDto) {
    return this.notificationsService.markManyAsRead(
      dto.notificationIds,
      req.user.id,
    );
  }

  /**
   * Mark all notifications as read
   */
  @Post('mark-all-read')
  async markAllAsRead(@Req() req: AuthRequest) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  /**
   * Delete notification
   */
  @Delete(':id')
  async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.notificationsService.remove(id, req.user.id);
  }

  /**
   * Get user notification preferences
   */
  @Get('preferences')
  async getPreferences(@Req() req: AuthRequest) {
    return this.preferenceService.getUserPreferences(req.user.id);
  }

  /**
   * Update notification preferences
   */
  @Patch('preferences')
  async updatePreferences(
    @Req() req: AuthRequest,
    @Body()
    body: {
      preferences: Array<{
        type: string;
        channel: string;
        isEnabled: boolean;
      }>;
    },
  ) {
    return this.preferenceService.updateMultiplePreferences(
      req.user.id,
      body.preferences as any,
    );
  }

  /**
   * Admin: Create notification (requires notification:create permission)
   */
  @Post()
  @RequirePermission(Resource.NOTIFICATION, Action.CREATE)
  async create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  /**
   * Admin: Send bulk notifications (requires notification:create permission)
   */
  @Post('bulk')
  @RequirePermission(Resource.NOTIFICATION, Action.CREATE)
  async createBulk(
    @Body() body: { notifications: CreateNotificationDto[] },
  ) {
    const results = await Promise.all(
      body.notifications.map((dto) => this.notificationsService.create(dto)),
    );
    return { created: results.length, notifications: results };
  }
}

import { IsString, IsEnum, IsOptional, IsUUID, IsObject, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from '../notifications.types.js';

export class CreateNotificationDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  titleAr?: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  messageAr?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledFor?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}

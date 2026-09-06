import { IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { z } from 'zod';
import { NotificationStatus, NotificationType } from '../notifications.types.js';

const queryInteger = (fallback: number, maximum: number) => z.preprocess(
  (value) => value === undefined || value === '' ? undefined : Number(value),
  z.number().int().min(1).max(maximum).default(fallback),
);

export const notificationQuerySchema = z.object({
  page: queryInteger(1, 1_000_000),
  limit: queryInteger(20, 100),
  type: z.nativeEnum(NotificationType).optional(),
  status: z.nativeEnum(NotificationStatus).optional(),
  unreadOnly: z.preprocess((value) => {
    if (value === undefined || value === '') return undefined;
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  }, z.boolean().optional()),
}).passthrough();

export class NotificationQueryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @IsOptional()
  @Type(() => Boolean)
  unreadOnly?: boolean;
}

export class MarkAsReadDto {
  @IsString({ each: true })
  notificationIds: string[];
}

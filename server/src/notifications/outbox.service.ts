import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DomainEvent } from './notifications.types.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  /**
   * Save event to outbox within a transaction
   * This ensures event is saved atomically with the aggregate
   */
  async saveEvent(
    event: DomainEvent,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const prismaClient = tx || this.prisma;

    await prismaClient.outbox.create({
      data: {
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        eventType: event.eventType,
        payload: event.payload as any,
        createdAt: event.occurredAt || new Date(),
      },
    });

    this.logger.debug(
      `Event ${event.eventType} saved to outbox for aggregate ${event.aggregateId}`,
    );
  }

  /**
   * Save multiple events in a transaction
   */
  async saveEvents(
    events: DomainEvent[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const prismaClient = tx || this.prisma;

    await prismaClient.outbox.createMany({
      data: events.map((event) => ({
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        eventType: event.eventType,
        payload: event.payload as any,
        createdAt: event.occurredAt || new Date(),
      })),
    });

    this.logger.debug(`${events.length} events saved to outbox`);
  }

  /**
   * Get unprocessed events from outbox
   */
  async getUnprocessedEvents(limit: number = 100): Promise<
    Array<{
      id: string;
      aggregateId: string;
      aggregateType: string;
      eventType: string;
      payload: any;
      createdAt: Date;
    }>
  > {
    return this.prisma.outbox.findMany({
      where: {
        processedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });
  }

  /**
   * Mark event as processed
   */
  async markAsProcessed(eventId: string): Promise<void> {
    await this.prisma.outbox.update({
      where: { id: eventId },
      data: { processedAt: new Date() },
    });
  }

  /**
   * Mark multiple events as processed
   */
  async markManyAsProcessed(eventIds: string[]): Promise<void> {
    await this.prisma.outbox.updateMany({
      where: {
        id: { in: eventIds },
      },
      data: {
        processedAt: new Date(),
      },
    });
  }

  /**
   * Clean up old processed events (optional - for maintenance)
   */
  async cleanupProcessedEvents(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.outbox.deleteMany({
      where: {
        processedAt: {
          not: null,
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(
      `Cleaned up ${result.count} processed events older than ${olderThanDays} days`,
    );
    return result.count;
  }
}

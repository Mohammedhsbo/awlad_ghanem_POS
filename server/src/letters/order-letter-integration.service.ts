import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LettersService } from './letters.service.js';
import { LetterType, OrderStatus } from '@motorcycle-system/shared-types';

/**
 * TASK-011: Order-Letter Integration Service
 * Handles automatic letter creation when orders reach awaiting_delivery status
 */
@Injectable()
export class OrderLetterIntegrationService {
  private readonly logger = new Logger(OrderLetterIntegrationService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LettersService) private readonly lettersService: LettersService,
  ) {}

  /**
   * Create letter automatically when order reaches awaiting_delivery
   * Called by order service when status changes to AWAITING_DELIVERY
   */
  async createLetterForOrder(orderId: string, userId: string): Promise<void> {
    try {
      // Fetch order with all required relations
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          customer: true,
          branch: {
            select: {
              id: true,
              nameEn: true,
              nameAr: true,
            },
          },
          items: {
            include: {
              motorcycle: true,
            },
          },
        },
      });

      if (!order) {
        this.logger.error(`Order ${orderId} not found for letter creation`);
        return;
      }

      // Check if letters already exist for this order
      const existingLetters = await this.prisma.letter.findMany({
        where: { orderId },
      });

      if (existingLetters.length > 0) {
        this.logger.log(`Letters already exist for order ${order.orderNumber}, skipping`);
        return;
      }

      // Get user with branch for letter creation
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { branch: true },
      });

      if (!user || !user.branch) {
        this.logger.error(`User ${userId} or branch not found for letter creation`);
        return;
      }

      // Create a letter for each motorcycle in the order
      for (const item of order.items) {
        try {
          await this.lettersService.createLetter(
            {
              customerId: order.customerId,
              motorcycleId: item.motorcycleId,
              orderId: order.id,
              type: LetterType.RECEIPT,
              notes: `Auto-created for order ${order.orderNumber}`,
            },
            user as any, // User with branch
          );

          this.logger.log(
            `Created letter for order ${order.orderNumber}, motorcycle ${item.motorcycle.vin}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to create letter for order ${order.orderNumber}, motorcycle ${item.motorcycleId}: ${error}`,
          );
          // Continue with other motorcycles
        }
      }
    } catch (error) {
      this.logger.error(`Error in createLetterForOrder for ${orderId}: ${error}`);
      // Don't throw - letter creation failure shouldn't block order status change
    }
  }

  /**
   * Complete order when all letters are received
   * This can be called when a letter is confirmed as received
   */
  async checkAndCompleteOrder(letterId: string): Promise<void> {
    try {
      const letter = await this.prisma.letter.findUnique({
        where: { id: letterId },
        include: {
          order: {
            include: {
              items: true,
            },
          },
        },
      });

      if (!letter || !letter.orderId || !letter.order) {
        return;
      }

      // Get all letters for this order
      const allLetters = await this.prisma.letter.findMany({
        where: { orderId: letter.orderId },
      });

      // Check if all letters are received
      const allReceived = allLetters.every((l) => l.status === 'received');

      if (!allReceived) {
        this.logger.log(
          `Order ${letter.order.orderNumber} still has pending letters, not completing`,
        );
        return;
      }

      // Check if order is in awaiting_delivery status
      if (letter.order.status !== OrderStatus.AWAITING_DELIVERY) {
        this.logger.log(
          `Order ${letter.order.orderNumber} not in awaiting_delivery status, skipping completion`,
        );
        return;
      }

      // Update order to completed
      await this.prisma.order.update({
        where: { id: letter.orderId },
        data: {
          status: OrderStatus.COMPLETED,
        },
      });

      this.logger.log(
        `Order ${letter.order.orderNumber} completed after all letters received`,
      );
    } catch (error) {
      this.logger.error(`Error in checkAndCompleteOrder for letter ${letterId}: ${error}`);
    }
  }
}

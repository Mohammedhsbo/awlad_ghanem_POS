import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  NotificationChannel,
  NotificationType,
  TemplateContext,
} from './notifications.types.js';

@Injectable()
export class NotificationTemplateService {
  private readonly logger = new Logger(NotificationTemplateService.name);

  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  /**
   * Render template with variables
   */
  async renderTemplate(
    code: string,
    context: TemplateContext,
  ): Promise<{ title: string; body: string }> {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { code },
    });

    if (!template) {
      throw new NotFoundException(`Template with code ${code} not found`);
    }

    if (!template.isActive) {
      throw new Error(`Template ${code} is not active`);
    }

    const isArabic = context.lang === 'ar';
    const titleTemplate = isArabic ? template.titleAr : template.titleEn;
    const bodyTemplate = isArabic ? template.bodyAr : template.bodyEn;

    return {
      title: this.interpolate(titleTemplate, context.variables),
      body: this.interpolate(bodyTemplate, context.variables),
    };
  }

  /**
   * Get template by type and channel
   */
  async getTemplate(type: NotificationType, channel: NotificationChannel) {
    return this.prisma.notificationTemplate.findFirst({
      where: {
        type,
        channel,
        isActive: true,
      },
    });
  }

  /**
   * Create or update template
   */
  async upsertTemplate(data: {
    code: string;
    type: NotificationType;
    channel: NotificationChannel;
    titleEn: string;
    titleAr: string;
    bodyEn: string;
    bodyAr: string;
    variables?: string[];
    isActive?: boolean;
  }) {
    const existing = await this.prisma.notificationTemplate.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      return this.prisma.notificationTemplate.update({
        where: { code: data.code },
        data: {
          type: data.type,
          channel: data.channel,
          titleEn: data.titleEn,
          titleAr: data.titleAr,
          bodyEn: data.bodyEn,
          bodyAr: data.bodyAr,
          variables: data.variables || [],
          isActive: data.isActive ?? true,
        },
      });
    }

    return this.prisma.notificationTemplate.create({
      data: {
        code: data.code,
        type: data.type,
        channel: data.channel,
        titleEn: data.titleEn,
        titleAr: data.titleAr,
        bodyEn: data.bodyEn,
        bodyAr: data.bodyAr,
        variables: data.variables || [],
        isActive: data.isActive ?? true,
      },
    });
  }

  /**
   * Simple template variable interpolation
   * Supports {{variable}} syntax
   */
  private interpolate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (key in variables) {
        return String(variables[key]);
      }
      this.logger.warn(`Variable ${key} not found in context`);
      return match;
    });
  }

  /**
   * Seed default templates
   */
  async seedDefaultTemplates(): Promise<void> {
    const templates = [
      {
        code: 'order_confirmed_inapp',
        type: NotificationType.ORDER_CONFIRMED,
        channel: NotificationChannel.IN_APP,
        titleEn: 'Order Confirmed',
        titleAr: 'تم تأكيد الطلب',
        bodyEn: 'Your order #{{orderNumber}} for {{motorcycleName}} has been confirmed. Total: {{totalAmount}} EGP',
        bodyAr: 'تم تأكيد طلبك #{{orderNumber}} لـ {{motorcycleName}}. المجموع: {{totalAmount}} ريال',
        variables: ['orderNumber', 'motorcycleName', 'totalAmount'],
      },
      {
        code: 'order_confirmed_sms',
        type: NotificationType.ORDER_CONFIRMED,
        channel: NotificationChannel.SMS,
        titleEn: 'Order Confirmed',
        titleAr: 'تم تأكيد الطلب',
        bodyEn: 'Order #{{orderNumber}} confirmed for {{motorcycleName}}',
        bodyAr: 'تم تأكيد الطلب #{{orderNumber}} لـ {{motorcycleName}}',
        variables: ['orderNumber', 'motorcycleName'],
      },
      {
        code: 'payment_received_inapp',
        type: NotificationType.PAYMENT_RECEIVED,
        channel: NotificationChannel.IN_APP,
        titleEn: 'Payment Received',
        titleAr: 'تم استلام الدفعة',
        bodyEn: 'Payment of {{amount}} EGP received via {{method}}',
        bodyAr: 'تم استلام دفعة بقيمة {{amount}} ريال عبر {{method}}',
        variables: ['amount', 'method'],
      },
      {
        code: 'installment_due_inapp',
        type: NotificationType.INSTALLMENT_DUE,
        channel: NotificationChannel.IN_APP,
        titleEn: 'Installment Due',
        titleAr: 'قسط مستحق',
        bodyEn: 'Installment of {{amount}} EGP is due on {{dueDate}}',
        bodyAr: 'قسط بقيمة {{amount}} ريال مستحق في {{dueDate}}',
        variables: ['amount', 'dueDate'],
      },
      {
        code: 'installment_due_sms',
        type: NotificationType.INSTALLMENT_DUE,
        channel: NotificationChannel.SMS,
        titleEn: 'Installment Reminder',
        titleAr: 'تذكير بالقسط',
        bodyEn: 'Installment of {{amount}} EGP due on {{dueDate}}',
        bodyAr: 'قسط بقيمة {{amount}} ريال مستحق في {{dueDate}}',
        variables: ['amount', 'dueDate'],
      },
      {
        code: 'reservation_expiring_inapp',
        type: NotificationType.RESERVATION_EXPIRING,
        channel: NotificationChannel.IN_APP,
        titleEn: 'Reservation Expiring Soon',
        titleAr: 'الحجز على وشك الانتهاء',
        bodyEn: 'Your reservation for {{motorcycleName}} expires on {{expiresAt}}',
        bodyAr: 'حجزك لـ {{motorcycleName}} ينتهي في {{expiresAt}}',
        variables: ['motorcycleName', 'expiresAt'],
      },
    ];

    for (const template of templates) {
      await this.upsertTemplate(template);
    }

    this.logger.log(`Seeded ${templates.length} default templates`);
  }
}

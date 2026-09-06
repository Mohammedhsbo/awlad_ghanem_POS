// TASK-005: Sales & Revenue Reports Service

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { User, OrderStatus, PaymentStatus, InvoiceStatus } from '@prisma/client';
import { SalesSummary, AgingReport, DateRange, GroupBy, SalesDimension } from './reports.types.js';
import { ReportUtils } from './reports.utils.js';

@Injectable()
export class SalesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getSalesSummary(
    branchFilter: any,
    dateRange: DateRange,
    groupBy?: GroupBy,
  ): Promise<SalesSummary> {
    const orders = await this.prisma.order.findMany({
      where: {
        ...branchFilter,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      include: {
        branch: true,
      },
    });

    const completedOrders = orders.filter((o) =>
      ([OrderStatus.completed, OrderStatus.awaiting_delivery, OrderStatus.processing] as OrderStatus[]).includes(o.status),
    );
    const cancelledOrders = orders.filter((o) => o.status === OrderStatus.cancelled);
    const refundedOrders = orders.filter((o) => o.status === OrderStatus.refunded);

    const totalSales = ReportUtils.sum(completedOrders.map((o) => o.netAmount));
    const orderCount = completedOrders.length;
    const averageOrderValue = orderCount > 0 ? totalSales / orderCount : 0;

    // By payment method - get from invoices/payments
    const invoices = await this.prisma.invoice.findMany({
      where: {
        ...branchFilter,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        status: { not: InvoiceStatus.cancelled },
      },
      include: {
        payments: {
          where: { status: PaymentStatus.completed },
        },
      },
    });

    const paymentMethodMap = new Map<string, { amount: number; count: number }>();
    invoices.forEach((inv) => {
      inv.payments.forEach((pay) => {
        const existing = paymentMethodMap.get(pay.method) || { amount: 0, count: 0 };
        existing.amount += ReportUtils.decimalToNumber(pay.amount);
        existing.count += 1;
        paymentMethodMap.set(pay.method, existing);
      });
    });

    const byPaymentMethod = Array.from(paymentMethodMap.entries()).map(([method, data]) => ({
      method,
      amount: ReportUtils.round(data.amount),
      count: data.count,
    }));

    // By branch
    const branchMap = new Map<string, { name: string; amount: number; count: number }>();
    completedOrders.forEach((order) => {
      const existing = branchMap.get(order.branchId) || {
        name: order.branch.nameEn,
        amount: 0,
        count: 0,
      };
      existing.amount += ReportUtils.decimalToNumber(order.netAmount);
      existing.count += 1;
      branchMap.set(order.branchId, existing);
    });

    const byBranch = Array.from(branchMap.entries()).map(([branchId, data]) => ({
      branchId,
      branchName: data.name,
      amount: ReportUtils.round(data.amount),
      count: data.count,
    }));

    // Trends by groupBy
    const trends = groupBy ? this.calculateTrends(completedOrders, groupBy) : [];

    return {
      totalSales: ReportUtils.round(totalSales),
      orderCount,
      averageOrderValue: ReportUtils.round(averageOrderValue),
      cancelledCount: cancelledOrders.length,
      refundedCount: refundedOrders.length,
      byPaymentMethod,
      byBranch,
      trends,
    };
  }

  async getSalesByDimension(
    branchFilter: any,
    dateRange: DateRange,
    dimension: SalesDimension,
    limit: number = 10,
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        ...branchFilter,
        status: { in: [OrderStatus.completed, OrderStatus.awaiting_delivery, OrderStatus.processing] },
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      include: {
        customer: true,
        user: true,
        branch: true,
        items: {
          include: {
            motorcycle: {
              include: {
                brand: true,
                category: true,
              },
            },
          },
        },
      },
    });

    switch (dimension) {
      case SalesDimension.CUSTOMER:
        return this.aggregateByCustomer(orders, limit);
      case SalesDimension.EMPLOYEE:
        return this.aggregateByEmployee(orders, limit);
      case SalesDimension.BRANCH:
        return this.aggregateByBranch(orders, limit);
      case SalesDimension.BRAND:
        return this.aggregateByBrand(orders, limit);
      case SalesDimension.MOTORCYCLE:
        return this.aggregateByMotorcycle(orders, limit);
      case SalesDimension.CATEGORY:
        return this.aggregateByCategory(orders, limit);
      default:
        throw new Error(`Unsupported dimension: ${dimension}`);
    }
  }

  async getRevenueCollection(branchFilter: any, dateRange: DateRange) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        ...branchFilter,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        status: { not: InvoiceStatus.cancelled },
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        ...branchFilter,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        status: PaymentStatus.completed,
      },
    });

    const invoicedAmount = ReportUtils.sum(invoices.map((i) => i.totalAmount));
    const collectedAmount = ReportUtils.sum(payments.map((p) => p.amount));
    const outstandingAmount = ReportUtils.sum(invoices.map((i) => i.remainingAmount));

    // By payment method
    const methodMap = new Map<string, number>();
    payments.forEach((p) => {
      methodMap.set(p.method, (methodMap.get(p.method) || 0) + ReportUtils.decimalToNumber(p.amount));
    });

    const byMethod = Array.from(methodMap.entries()).map(([method, amount]) => ({
      method,
      amount: ReportUtils.round(amount),
    }));

    return {
      invoicedAmount: ReportUtils.round(invoicedAmount),
      collectedAmount: ReportUtils.round(collectedAmount),
      outstandingAmount: ReportUtils.round(outstandingAmount),
      collectionRate: invoicedAmount > 0 ? ReportUtils.round((collectedAmount / invoicedAmount) * 100) : 0,
      byMethod,
    };
  }

  async getAgingReport(branchFilter: any): Promise<AgingReport> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        ...branchFilter,
        status: { in: [InvoiceStatus.issued, InvoiceStatus.partially_paid] },
        remainingAmount: { gt: 0 },
      },
      include: {
        customer: true,
      },
      orderBy: {
        issueDate: 'asc',
      },
    });

    const now = new Date();
    const buckets = [
      { label: '0-30 days', days: '0-30', min: 0, max: 30, customers: new Map<string, any>() },
      { label: '31-60 days', days: '31-60', min: 31, max: 60, customers: new Map<string, any>() },
      { label: '61-90 days', days: '61-90', min: 61, max: 90, customers: new Map<string, any>() },
      { label: '90+ days', days: '90+', min: 91, max: Infinity, customers: new Map<string, any>() },
    ];

    invoices.forEach((invoice) => {
      if (!invoice.issueDate) return;
      const daysPast = Math.floor((now.getTime() - invoice.issueDate.getTime()) / (1000 * 60 * 60 * 24));
      const bucket = buckets.find((b) => daysPast >= b.min && daysPast <= b.max);

      if (bucket) {
        const customerId = invoice.customerId;
        const existing = bucket.customers.get(customerId) || {
          customerId,
          customerName: invoice.customer.name,
          amount: 0,
          oldestInvoiceDate: invoice.issueDate,
        };
        existing.amount += ReportUtils.decimalToNumber(invoice.remainingAmount);
        if (invoice.issueDate < existing.oldestInvoiceDate) {
          existing.oldestInvoiceDate = invoice.issueDate;
        }
        bucket.customers.set(customerId, existing);
      }
    });

    const total = ReportUtils.sum(invoices.map((i) => i.remainingAmount));

    return {
      total: ReportUtils.round(total),
      buckets: buckets.map((b) => ({
        label: b.label,
        days: b.days,
        amount: ReportUtils.round(Array.from(b.customers.values()).reduce((sum, c) => sum + c.amount, 0)),
        count: b.customers.size,
        customers: Array.from(b.customers.values())
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 10),
      })),
    };
  }

  // Private helper methods
  private calculateTrends(orders: any[], groupBy: GroupBy) {
    const periodMap = new Map<string, { amount: number; count: number }>();

    orders.forEach((order) => {
      const key = this.getPeriodKey(order.createdAt, groupBy);
      const existing = periodMap.get(key) || { amount: 0, count: 0 };
      existing.amount += ReportUtils.decimalToNumber(order.netAmount);
      existing.count += 1;
      periodMap.set(key, existing);
    });

    return Array.from(periodMap.entries())
      .map(([period, data]) => ({
        period,
        amount: ReportUtils.round(data.amount),
        count: data.count,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  private getPeriodKey(date: Date, groupBy: GroupBy): string {
    switch (groupBy) {
      case GroupBy.DAY:
        return ReportUtils.formatDate(ReportUtils.startOfDay(date), 'yyyy-MM-dd');
      case GroupBy.WEEK:
        return ReportUtils.formatDate(ReportUtils.startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      case GroupBy.MONTH:
        return ReportUtils.formatDate(ReportUtils.startOfMonth(date), 'yyyy-MM');
      case GroupBy.QUARTER:
        return ReportUtils.formatDate(ReportUtils.startOfQuarter(date), 'yyyy-[Q]Q');
      case GroupBy.YEAR:
        return ReportUtils.formatDate(ReportUtils.startOfYear(date), 'yyyy');
      default:
        return ReportUtils.formatDate(date, 'yyyy-MM-dd');
    }
  }

  private aggregateByCustomer(orders: any[], limit: number) {
    const customerMap = new Map<string, { name: string; amount: number; count: number }>();
    orders.forEach((order) => {
      const existing = customerMap.get(order.customerId) || {
        name: order.customer.name,
        amount: 0,
        count: 0,
      };
      existing.amount += ReportUtils.decimalToNumber(order.netAmount);
      existing.count += 1;
      customerMap.set(order.customerId, existing);
    });

    return Array.from(customerMap.entries())
      .map(([customerId, data]) => ({ customerId, ...data, amount: ReportUtils.round(data.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
  }

  private aggregateByEmployee(orders: any[], limit: number) {
    const employeeMap = new Map<string, { name: string; amount: number; count: number }>();
    orders.forEach((order) => {
      const existing = employeeMap.get(order.userId) || {
        name: order.user.name,
        amount: 0,
        count: 0,
      };
      existing.amount += ReportUtils.decimalToNumber(order.netAmount);
      existing.count += 1;
      employeeMap.set(order.userId, existing);
    });

    return Array.from(employeeMap.entries())
      .map(([userId, data]) => ({ userId, ...data, amount: ReportUtils.round(data.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
  }

  private aggregateByBranch(orders: any[], limit: number) {
    const branchMap = new Map<string, { name: string; amount: number; count: number }>();
    orders.forEach((order) => {
      const existing = branchMap.get(order.branchId) || {
        name: order.branch.nameEn,
        amount: 0,
        count: 0,
      };
      existing.amount += ReportUtils.decimalToNumber(order.netAmount);
      existing.count += 1;
      branchMap.set(order.branchId, existing);
    });

    return Array.from(branchMap.entries())
      .map(([branchId, data]) => ({ branchId, ...data, amount: ReportUtils.round(data.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
  }

  private aggregateByBrand(orders: any[], limit: number) {
    const brandMap = new Map<string, { amount: number; count: number }>();
    orders.forEach((order) => {
      order.items.forEach((item: any) => {
        const brand = item.motorcycle.brand.nameEn;
        const existing = brandMap.get(brand) || { amount: 0, count: 0 };
        existing.amount += ReportUtils.decimalToNumber(item.unitPrice);
        existing.count += 1;
        brandMap.set(brand, existing);
      });
    });

    return Array.from(brandMap.entries())
      .map(([brand, data]) => ({ brand, ...data, amount: ReportUtils.round(data.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
  }

  private aggregateByMotorcycle(orders: any[], limit: number) {
    const motorcycleMap = new Map<string, { model: string; brand: string; amount: number; count: number }>();
    orders.forEach((order) => {
      order.items.forEach((item: any) => {
        const key = `${item.motorcycle.brand.nameEn}_${item.motorcycle.model}`;
        const existing = motorcycleMap.get(key) || {
          model: item.motorcycle.model,
          brand: item.motorcycle.brand.nameEn,
          amount: 0,
          count: 0,
        };
        existing.amount += ReportUtils.decimalToNumber(item.unitPrice);
        existing.count += 1;
        motorcycleMap.set(key, existing);
      });
    });

    return Array.from(motorcycleMap.entries())
      .map(([key, data]) => ({ ...data, amount: ReportUtils.round(data.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
  }

  private aggregateByCategory(orders: any[], limit: number) {
    const categoryMap = new Map<string, { amount: number; count: number }>();
    orders.forEach((order) => {
      order.items.forEach((item: any) => {
        const category = item.motorcycle.category?.nameEn || 'Uncategorized';
        const existing = categoryMap.get(category) || { amount: 0, count: 0 };
        existing.amount += ReportUtils.decimalToNumber(item.unitPrice);
        existing.count += 1;
        categoryMap.set(category, existing);
      });
    });

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data, amount: ReportUtils.round(data.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
  }
}

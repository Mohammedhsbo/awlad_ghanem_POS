// TASK-003 & TASK-004: Dashboard KPI Service

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { User, Branch, OrderStatus, InvoiceStatus, PaymentStatus, ReservationStatus, FinancingContractStatus, InstallmentStatus } from '@prisma/client';
import { ExecutiveDashboard, OperationalDashboard, DateRange } from './reports.types.js';
import { ReportUtils } from './reports.utils.js';

@Injectable()
export class DashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getExecutiveDashboard(
    user: User & { branch?: Branch; role?: { name: string } },
    dateRange: DateRange,
    branchIds: string[],
  ): Promise<ExecutiveDashboard> {
    const branchFilter = ReportUtils.buildBranchFilter(branchIds);

    // Run all queries in parallel for performance
    const [
      salesData,
      revenueData,
      inventoryData,
      customerData,
      financingData,
    ] = await Promise.all([
      this.calculateSalesMetrics(branchFilter, dateRange),
      this.calculateRevenueMetrics(branchFilter, dateRange),
      this.calculateInventoryMetrics(branchFilter),
      this.calculateCustomerMetrics(branchFilter, dateRange),
      this.calculateFinancingMetrics(branchFilter),
    ]);

    const normalizedDateRange: { start: Date; end: Date } = {
      start: dateRange.start ?? new Date(),
      end: dateRange.end ?? new Date(),
    };

    return {
      sales: salesData,
      revenue: revenueData,
      inventory: inventoryData,
      customers: customerData,
      financing: financingData,
      period: normalizedDateRange,
      branches: branchIds,
    };
  }

  async getOperationalDashboard(
    user: User & { branch?: Branch; role?: { name: string } },
    dateRange: DateRange,
    branchIds: string[],
  ): Promise<OperationalDashboard> {
    const branchFilter = ReportUtils.buildBranchFilter(branchIds);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [reservationMetrics, recentOrders, recentPayments, branchPerformance] = await Promise.all([
      this.calculateReservationMetrics(branchFilter, dateRange),
      this.getRecentOrders(branchFilter, twentyFourHoursAgo),
      this.getRecentPayments(branchFilter, twentyFourHoursAgo),
      this.calculateBranchPerformance(branchIds, dateRange),
    ]);

    return {
      reservations: reservationMetrics,
      recentOrders,
      recentPayments,
      branchPerformance,
    };
  }

  // Sales Metrics Calculation
  private async calculateSalesMetrics(branchFilter: any, dateRange: DateRange) {
    // Get completed orders in date range
    const orders = await this.prisma.order.findMany({
      where: {
        ...branchFilter,
        status: { in: [OrderStatus.completed, OrderStatus.awaiting_delivery, OrderStatus.processing] },
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      include: {
        items: {
          include: {
            motorcycle: {
              include: {
                brand: true,
              },
            },
          },
        },
      },
    });

    const totalRevenue = ReportUtils.sum(orders.map((o) => o.netAmount));
    const orderCount = orders.length;
    const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

    // Calculate growth (compare with previous period)
    const periodLength = dateRange.end.getTime() - dateRange.start.getTime();
    const previousStart = new Date(dateRange.start.getTime() - periodLength);
    const previousOrders = await this.prisma.order.findMany({
      where: {
        ...branchFilter,
        status: { in: [OrderStatus.completed, OrderStatus.awaiting_delivery, OrderStatus.processing] },
        createdAt: { gte: previousStart, lt: dateRange.start },
      },
    });
    const previousRevenue = ReportUtils.sum(previousOrders.map((o) => o.netAmount));
    const growth = ReportUtils.calculateGrowth(totalRevenue, previousRevenue);

    // Top motorcycles by count and revenue
    const motorcycleSales = new Map<string, { model: string; brand: string; count: number; revenue: number }>();
    orders.forEach((order) => {
      order.items.forEach((item) => {
        const key = `${item.motorcycle.brand.nameEn}_${item.motorcycle.model}`;
        const existing = motorcycleSales.get(key) || {
          model: item.motorcycle.model,
          brand: item.motorcycle.brand.nameEn,
          count: 0,
          revenue: 0,
        };
        existing.count += 1;
        existing.revenue += ReportUtils.decimalToNumber(item.unitPrice);
        motorcycleSales.set(key, existing);
      });
    });

    const topMotorcycles = Array.from(motorcycleSales.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      totalRevenue: ReportUtils.round(totalRevenue),
      orderCount,
      averageOrderValue: ReportUtils.round(averageOrderValue),
      growth: ReportUtils.round(growth),
      topMotorcycles,
    };
  }

  // Revenue Metrics Calculation (SPEC-008 source of truth)
  private async calculateRevenueMetrics(branchFilter: any, dateRange: DateRange) {
    // Gross revenue from invoices
    const invoices = await this.prisma.invoice.findMany({
      where: {
        ...branchFilter,
        status: { not: InvoiceStatus.cancelled },
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });

    const grossRevenue = ReportUtils.sum(invoices.map((i) => i.totalAmount));
    const outstandingAmount = ReportUtils.sum(invoices.map((i) => i.remainingAmount));

    // Collected amount from payments
    const payments = await this.prisma.payment.findMany({
      where: {
        ...branchFilter,
        status: PaymentStatus.completed,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });

    const collectedAmount = ReportUtils.sum(payments.map((p) => p.amount));

    // Refunds
    const refunds = await this.prisma.refund.findMany({
      where: {
        payment: {
          ...branchFilter,
        },
        status: 'completed',
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });

    const refundAmount = ReportUtils.sum(refunds.map((r) => r.amount));
    const netRevenue = collectedAmount - refundAmount;

    return {
      grossRevenue: ReportUtils.round(grossRevenue),
      collectedAmount: ReportUtils.round(collectedAmount),
      outstandingAmount: ReportUtils.round(outstandingAmount),
      refundAmount: ReportUtils.round(refundAmount),
      netRevenue: ReportUtils.round(netRevenue),
    };
  }

  // Inventory Metrics Calculation
  private async calculateInventoryMetrics(branchFilter: any) {
    const motorcycles = await this.prisma.motorcycle.findMany({
      where: branchFilter,
      include: {
        purchaseItem: {
          include: {
            purchase: true,
          },
        },
      },
    });

    const total = motorcycles.length;
    const available = motorcycles.filter((m) => m.status === 'available').length;
    const reserved = motorcycles.filter((m) => m.status === 'reserved').length;
    const sold = motorcycles.filter((m) => m.status === 'sold').length;
    const inTransit = motorcycles.filter((m) => m.status === 'in_transit').length;

    // Calculate inventory value from acquisition cost
    const inventoryValue = motorcycles.reduce((sum, m) => {
      if (m.purchaseItem) {
        return sum + ReportUtils.decimalToNumber(m.purchaseItem.unitCost);
      }
      return sum;
    }, 0);

    return {
      totalMotorcycles: total,
      available,
      reserved,
      sold,
      inTransit,
      inventoryValue: ReportUtils.round(inventoryValue),
    };
  }

  // Customer Metrics Calculation
  private async calculateCustomerMetrics(branchFilter: any, dateRange: DateRange) {
    const allCustomers = await this.prisma.customer.findMany({
      where: {
        isActive: true,
      },
      include: {
        orders: {
          where: branchFilter,
        },
      },
    });

    const totalActive = allCustomers.length;

    const newCustomers = await this.prisma.customer.count({
      where: {
        isActive: true,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });

    const withActiveOrders = allCustomers.filter((c) =>
      c.orders.some((o) => o.status !== OrderStatus.cancelled && o.status !== OrderStatus.completed),
    ).length;

    // Customers with outstanding balances
    const invoices = await this.prisma.invoice.findMany({
      where: {
        ...branchFilter,
        remainingAmount: { gt: 0 },
        status: { notIn: [InvoiceStatus.cancelled, InvoiceStatus.paid] },
      },
      select: { customerId: true },
    });
    const withOutstandingBalance = new Set(invoices.map((i) => i.customerId)).size;

    // Retention rate: customers with orders in both periods
    const periodLength = dateRange.end.getTime() - dateRange.start.getTime();
    const previousStart = new Date(dateRange.start.getTime() - periodLength);
    const previousCustomers = await this.prisma.customer.findMany({
      where: {
        createdAt: { gte: previousStart, lt: dateRange.start },
      },
      include: {
        orders: {
          where: {
            ...branchFilter,
            createdAt: { gte: dateRange.start, lte: dateRange.end },
          },
        },
      },
    });
    const retained = previousCustomers.filter((c) => c.orders.length > 0).length;
    const retentionRate = previousCustomers.length > 0 ? (retained / previousCustomers.length) * 100 : 0;

    return {
      totalActive,
      newCustomers,
      withActiveOrders,
      withOutstandingBalance,
      retentionRate: ReportUtils.round(retentionRate),
    };
  }

  // Financing Metrics Calculation (SPEC-009 source of truth)
  private async calculateFinancingMetrics(branchFilter: any) {
    const contracts = await this.prisma.financingContract.findMany({
      where: {
        ...branchFilter,
        status: FinancingContractStatus.active,
      },
      include: {
        installments: true,
      },
    });

    const activeContracts = contracts.length;
    const totalFinanced = ReportUtils.sum(contracts.map((c) => c.financingAmount));

    const allInstallments = contracts.flatMap((c) => c.installments);
    const paidInstallments = allInstallments.filter((i) => i.status === InstallmentStatus.paid);
    const overdueInstallments = allInstallments.filter((i) => i.status === InstallmentStatus.overdue);

    const collectedAmount = ReportUtils.sum(paidInstallments.map((i) => i.paidAmount));
    const outstandingBalance = totalFinanced - collectedAmount;
    const overdueCount = overdueInstallments.length;
    const collectionRate = totalFinanced > 0 ? (collectedAmount / totalFinanced) * 100 : 0;

    return {
      activeContracts,
      totalFinanced: ReportUtils.round(totalFinanced),
      collectedAmount: ReportUtils.round(collectedAmount),
      outstandingBalance: ReportUtils.round(outstandingBalance),
      overdueCount,
      collectionRate: ReportUtils.round(collectionRate),
    };
  }

  // Reservation Metrics Calculation
  private async calculateReservationMetrics(branchFilter: any, dateRange: DateRange) {
    const reservations = await this.prisma.reservation.findMany({
      where: {
        ...branchFilter,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });

    const activeCount = reservations.filter((r) => r.status === ReservationStatus.active).length;
    const convertedCount = reservations.filter((r) => r.status === ReservationStatus.converted).length;
    const expiredCount = reservations.filter((r) => r.status === ReservationStatus.expired).length;

    const conversionRate = reservations.length > 0 ? (convertedCount / reservations.length) * 100 : 0;

    const totalDeposits = ReportUtils.sum(reservations.map((r) => r.paidAmount));

    // Average duration for converted reservations
    const convertedReservations = reservations.filter((r) => r.status === ReservationStatus.converted);
    const durations = convertedReservations.map((r) => {
      const end = r.expiresAt || new Date();
      return (end.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24); // days
    });
    const averageDuration = durations.length > 0 ? ReportUtils.average(durations) : 0;

    return {
      activeCount,
      conversionRate: ReportUtils.round(conversionRate),
      averageDuration: ReportUtils.round(averageDuration),
      totalDeposits: ReportUtils.round(totalDeposits),
      expiredCount,
    };
  }

  // Recent Orders
  private async getRecentOrders(branchFilter: any, since: Date) {
    const orders = await this.prisma.order.findMany({
      where: {
        ...branchFilter,
        createdAt: { gte: since },
      },
      include: {
        customer: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer.name,
      amount: ReportUtils.decimalToNumber(o.netAmount),
      status: o.status,
      createdAt: o.createdAt,
    }));
  }

  // Recent Payments
  private async getRecentPayments(branchFilter: any, since: Date) {
    const payments = await this.prisma.payment.findMany({
      where: {
        ...branchFilter,
        createdAt: { gte: since },
        status: PaymentStatus.completed,
      },
      include: {
        customer: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return payments.map((p) => ({
      id: p.id,
      paymentReference: p.paymentReference,
      customerName: p.customer.name,
      amount: ReportUtils.decimalToNumber(p.amount),
      method: p.method,
      createdAt: p.createdAt,
    }));
  }

  // Branch Performance
  private async calculateBranchPerformance(branchIds: string[], dateRange: DateRange) {
    if (branchIds.length === 0) {
      // Get all branches for super admin
      branchIds = (await this.prisma.branch.findMany({ select: { id: true } })).map((b) => b.id);
    }

    const performance = await Promise.all(
      branchIds.map(async (branchId) => {
        const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
        const orders = await this.prisma.order.findMany({
          where: {
            branchId,
            status: { in: [OrderStatus.completed, OrderStatus.awaiting_delivery, OrderStatus.processing] },
            createdAt: { gte: dateRange.start, lte: dateRange.end },
          },
        });
        const customers = await this.prisma.customer.count({
          where: {
            orders: {
              some: {
                branchId,
                createdAt: { gte: dateRange.start, lte: dateRange.end },
              },
            },
          },
        });

        return {
          branchId,
          branchName: branch?.nameEn || 'Unknown',
          sales: ReportUtils.round(ReportUtils.sum(orders.map((o) => o.netAmount))),
          orders: orders.length,
          customers,
        };
      }),
    );

    return performance.sort((a, b) => b.sales - a.sales);
  }
}

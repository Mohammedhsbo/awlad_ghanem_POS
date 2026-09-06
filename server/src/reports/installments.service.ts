// TASK-007: Customer & Installment Reports Service

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { InstallmentPortfolio, DateRange } from './reports.types.js';
import { ReportUtils } from './reports.utils.js';
import { FinancingContractStatus, InstallmentStatus } from '@prisma/client';

@Injectable()
export class InstallmentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getInstallmentPortfolio(branchFilter: any): Promise<InstallmentPortfolio> {
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
    const paidAmount = ReportUtils.sum(allInstallments.map((i) => i.paidAmount));
    const outstandingAmount = totalFinanced - paidAmount;

    // Overdue amount
    const overdueInstallments = allInstallments.filter((i) => i.status === InstallmentStatus.overdue);
    const overdueAmount = ReportUtils.sum(overdueInstallments.map((i) => {
      const remaining = ReportUtils.decimalToNumber(i.amount) - ReportUtils.decimalToNumber(i.paidAmount);
      return remaining;
    }));

    const collectionRate = totalFinanced > 0 ? (paidAmount / totalFinanced) * 100 : 0;

    // By status
    const statusCounts = {
      upcoming: allInstallments.filter((i) => i.status === InstallmentStatus.upcoming).length,
      due: allInstallments.filter((i) => i.status === InstallmentStatus.due).length,
      paid: allInstallments.filter((i) => i.status === InstallmentStatus.paid).length,
      overdue: overdueInstallments.length,
    };

    const byStatus = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
      amount: 0, // Could calculate if needed
    }));

    // Aging buckets for overdue
    const now = new Date();
    const agingBuckets = [
      { bucket: '1-30 days', count: 0, amount: 0 },
      { bucket: '31-60 days', count: 0, amount: 0 },
      { bucket: '61-90 days', count: 0, amount: 0 },
      { bucket: '90+ days', count: 0, amount: 0 },
    ];

    overdueInstallments.forEach((inst) => {
      const daysPast = Math.floor((now.getTime() - inst.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const amount = ReportUtils.decimalToNumber(inst.amount) - ReportUtils.decimalToNumber(inst.paidAmount);

      if (daysPast <= 30) {
        agingBuckets[0].count += 1;
        agingBuckets[0].amount += amount;
      } else if (daysPast <= 60) {
        agingBuckets[1].count += 1;
        agingBuckets[1].amount += amount;
      } else if (daysPast <= 90) {
        agingBuckets[2].count += 1;
        agingBuckets[2].amount += amount;
      } else {
        agingBuckets[3].count += 1;
        agingBuckets[3].amount += amount;
      }
    });

    const byAgingBucket = agingBuckets.map((b) => ({
      ...b,
      amount: ReportUtils.round(b.amount),
    }));

    return {
      activeContracts,
      totalFinanced: ReportUtils.round(totalFinanced),
      paidAmount: ReportUtils.round(paidAmount),
      outstandingAmount: ReportUtils.round(outstandingAmount),
      overdueAmount: ReportUtils.round(overdueAmount),
      collectionRate: ReportUtils.round(collectionRate),
      byStatus,
      byAgingBucket,
    };
  }

  async getOverdueInstallments(branchFilter: any) {
    const contracts = await this.prisma.financingContract.findMany({
      where: {
        ...branchFilter,
        status: FinancingContractStatus.active,
      },
      include: {
        customer: true,
        installments: {
          where: {
            status: InstallmentStatus.overdue,
          },
          orderBy: {
            dueDate: 'asc',
          },
        },
      },
    });

    const overdueList = contracts
      .filter((c) => c.installments.length > 0)
      .map((contract) => {
        const totalOverdue = ReportUtils.sum(contract.installments.map((i) => {
          return ReportUtils.decimalToNumber(i.amount) - ReportUtils.decimalToNumber(i.paidAmount);
        }));
        const oldestDue = contract.installments[0].dueDate;
        const daysPast = Math.floor((new Date().getTime() - oldestDue.getTime()) / (1000 * 60 * 60 * 24));

        return {
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          customerId: contract.customerId,
          customerName: contract.customer.name,
          customerPhone: contract.customer.phone,
          overdueCount: contract.installments.length,
          overdueAmount: ReportUtils.round(totalOverdue),
          oldestDueDate: oldestDue,
          daysPastDue: daysPast,
        };
      })
      .sort((a, b) => b.daysPastDue - a.daysPastDue);

    return overdueList;
  }

  async getCustomerAnalytics(branchFilter: any, dateRange: DateRange) {
    // New customers in period
    const newCustomers = await this.prisma.customer.count({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        isActive: true,
      },
    });

    // Customers with orders in period
    const customersWithOrders = await this.prisma.customer.count({
      where: {
        orders: {
          some: {
            ...branchFilter,
            createdAt: { gte: dateRange.start, lte: dateRange.end },
          },
        },
      },
    });

    // Top customers by revenue
    const orders = await this.prisma.order.findMany({
      where: {
        ...branchFilter,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        status: { in: ['completed', 'awaiting_delivery', 'processing'] },
      },
      include: {
        customer: true,
      },
    });

    const customerMap = new Map<string, { name: string; phone: string; orders: number; revenue: number }>();
    orders.forEach((order) => {
      const existing = customerMap.get(order.customerId) || {
        name: order.customer.name,
        phone: order.customer.phone,
        orders: 0,
        revenue: 0,
      };
      existing.orders += 1;
      existing.revenue += ReportUtils.decimalToNumber(order.netAmount);
      customerMap.set(order.customerId, existing);
    });

    const topCustomers = Array.from(customerMap.entries())
      .map(([customerId, data]) => ({
        customerId,
        ...data,
        revenue: ReportUtils.round(data.revenue),
        averageOrderValue: ReportUtils.round(data.revenue / data.orders),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Customer retention (repeat customers)
    const repeatCustomers = Array.from(customerMap.values()).filter((c) => c.orders > 1).length;
    const retentionRate = customersWithOrders > 0 ? (repeatCustomers / customersWithOrders) * 100 : 0;

    return {
      newCustomers,
      customersWithOrders,
      repeatCustomers,
      retentionRate: ReportUtils.round(retentionRate),
      topCustomers,
    };
  }
}

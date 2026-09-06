// TASK-006: Inventory & Purchase Reports Service

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryStatus, DateRange } from './reports.types.js';
import { ReportUtils } from './reports.utils.js';

@Injectable()
export class InventoryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getCurrentInventoryStatus(branchFilter: any): Promise<InventoryStatus> {
    const motorcycles = await this.prisma.motorcycle.findMany({
      where: branchFilter,
      include: {
        brand: true,
        category: true,
        branch: true,
        purchaseItem: {
          include: {
            purchase: true,
          },
        },
      },
    });

    const total = motorcycles.length;

    // By status
    const statusMap = new Map<string, { count: number; value: number }>();
    motorcycles.forEach((m) => {
      const status = m.status;
      const existing = statusMap.get(status) || { count: 0, value: 0 };
      existing.count += 1;
      if (m.purchaseItem) {
        existing.value += ReportUtils.decimalToNumber(m.purchaseItem.unitCost);
      }
      statusMap.set(status, existing);
    });

    const byStatus = Array.from(statusMap.entries()).map(([status, data]) => ({
      status,
      count: data.count,
      value: ReportUtils.round(data.value),
    }));

    // By brand
    const brandMap = new Map<string, { count: number; value: number }>();
    motorcycles.forEach((m) => {
      const brand = m.brand.nameEn;
      const existing = brandMap.get(brand) || { count: 0, value: 0 };
      existing.count += 1;
      if (m.purchaseItem) {
        existing.value += ReportUtils.decimalToNumber(m.purchaseItem.unitCost);
      }
      brandMap.set(brand, existing);
    });

    const byBrand = Array.from(brandMap.entries())
      .map(([brand, data]) => ({
        brand,
        count: data.count,
        value: ReportUtils.round(data.value),
      }))
      .sort((a, b) => b.count - a.count);

    // By branch
    const branchMap = new Map<string, { name: string; count: number; value: number }>();
    motorcycles.forEach((m) => {
      const branchId = m.branchId;
      const existing = branchMap.get(branchId) || { name: m.branch.nameEn, count: 0, value: 0 };
      existing.count += 1;
      if (m.purchaseItem) {
        existing.value += ReportUtils.decimalToNumber(m.purchaseItem.unitCost);
      }
      branchMap.set(branchId, existing);
    });

    const byBranch = Array.from(branchMap.entries()).map(([branchId, data]) => ({
      branchId,
      branchName: data.name,
      count: data.count,
      value: ReportUtils.round(data.value),
    }));

    // Average age
    const now = new Date();
    const ages = motorcycles.map((m) => (now.getTime() - m.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const averageAge = ages.length > 0 ? ReportUtils.average(ages) : 0;

    return {
      total,
      byStatus,
      byBrand,
      byBranch,
      averageAge: ReportUtils.round(averageAge),
    };
  }

  async getInventoryMovement(branchFilter: any, dateRange: DateRange) {
    // Motorcycles received (from purchases)
    const received = await this.prisma.motorcycle.count({
      where: {
        ...branchFilter,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });

    // Motorcycles sold
    const sold = await this.prisma.orderItem.count({
      where: {
        order: {
          ...branchFilter,
          status: { in: ['completed', 'awaiting_delivery', 'processing'] },
          createdAt: { gte: dateRange.start, lte: dateRange.end },
        },
      },
    });

    // Transfers in/out
    const transfersOut = await this.prisma.transfer.count({
      where: {
        fromBranchId: branchFilter.branchId,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        status: { in: ['in_transit', 'received'] },
      },
    });

    const transfersIn = await this.prisma.transfer.count({
      where: {
        toBranchId: branchFilter.branchId,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        status: 'received',
      },
    });

    return {
      received,
      sold,
      transfersOut,
      transfersIn,
      netChange: received + transfersIn - sold - transfersOut,
    };
  }

  async getPurchaseAnalytics(branchFilter: any, dateRange: DateRange) {
    const purchases = await this.prisma.purchase.findMany({
      where: {
        ...branchFilter,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      include: {
        supplier: true,
        items: true,
      },
    });

    const totalPurchases = purchases.length;
    const totalValue = ReportUtils.sum(purchases.map((p) => p.totalAmount));
    const totalItems = purchases.reduce((sum, p) => sum + p.items.length, 0);

    // By supplier
    const supplierMap = new Map<string, { name: string; count: number; value: number }>();
    purchases.forEach((p) => {
      const existing = supplierMap.get(p.supplierId) || {
        name: p.supplier.name,
        count: 0,
        value: 0,
      };
      existing.count += 1;
      existing.value += ReportUtils.decimalToNumber(p.totalAmount);
      supplierMap.set(p.supplierId, existing);
    });

    const bySupplier = Array.from(supplierMap.entries())
      .map(([supplierId, data]) => ({
        supplierId,
        supplierName: data.name,
        count: data.count,
        value: ReportUtils.round(data.value),
      }))
      .sort((a, b) => b.value - a.value);

    // By status
    const byStatus = [
      { status: 'draft', count: purchases.filter((p) => p.status === 'draft').length },
      { status: 'ordered', count: purchases.filter((p) => p.status === 'ordered').length },
      { status: 'partially_received', count: purchases.filter((p) => p.status === 'partially_received').length },
      { status: 'received', count: purchases.filter((p) => p.status === 'received').length },
      { status: 'cancelled', count: purchases.filter((p) => p.status === 'cancelled').length },
    ];

    return {
      totalPurchases,
      totalValue: ReportUtils.round(totalValue),
      totalItems,
      averageValue: totalPurchases > 0 ? ReportUtils.round(totalValue / totalPurchases) : 0,
      bySupplier,
      byStatus,
    };
  }

  async getSupplierPerformance(dateRange: DateRange) {
    const purchases = await this.prisma.purchase.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      include: {
        supplier: true,
      },
    });

    const supplierMap = new Map<
      string,
      { name: string; purchases: number; value: number; items: number }
    >();

    purchases.forEach((p) => {
      const existing = supplierMap.get(p.supplierId) || {
        name: p.supplier.name,
        purchases: 0,
        value: 0,
        items: 0,
      };
      existing.purchases += 1;
      existing.value += ReportUtils.decimalToNumber(p.totalAmount);

      supplierMap.set(p.supplierId, existing);
    });

    return Array.from(supplierMap.entries())
      .map(([supplierId, data]) => ({
        supplierId,
        supplierName: data.name,
        purchases: data.purchases,
        totalValue: ReportUtils.round(data.value),
        averageLeadTime: 0, // Not available in schema
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }
}

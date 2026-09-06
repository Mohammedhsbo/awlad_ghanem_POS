import { z } from 'zod';

// TASK-001: Report Type Definitions & Schemas

export enum ReportType {
  EXECUTIVE_DASHBOARD = 'executive_dashboard',
  OPERATIONAL_DASHBOARD = 'operational_dashboard',
  SALES_SUMMARY = 'sales_summary',
  SALES_BY_DIMENSION = 'sales_by_dimension',
  SALES_TRENDS = 'sales_trends',
  REVENUE_COLLECTION = 'revenue_collection',
  PAYMENT_ANALYTICS = 'payment_analytics',
  AGING_REPORT = 'aging_report',
  INVENTORY_STATUS = 'inventory_status',
  INVENTORY_MOVEMENT = 'inventory_movement',
  INVENTORY_VALUATION = 'inventory_valuation',
  PURCHASE_ANALYTICS = 'purchase_analytics',
  SUPPLIER_PERFORMANCE = 'supplier_performance',
  CUSTOMER_ANALYTICS = 'customer_analytics',
  INSTALLMENT_PORTFOLIO = 'installment_portfolio',
  OVERDUE_INSTALLMENTS = 'overdue_installments',
  STAFF_PERFORMANCE = 'staff_performance',
  BRANCH_OPERATIONS = 'branch_operations',
}

export enum DateRangePreset {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  THIS_WEEK = 'this_week',
  LAST_WEEK = 'last_week',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  THIS_QUARTER = 'this_quarter',
  LAST_QUARTER = 'last_quarter',
  THIS_YEAR = 'this_year',
  LAST_YEAR = 'last_year',
  ALL_TIME = 'all_time',
  CUSTOM = 'custom',
}

export enum GroupBy {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
}

export enum SalesDimension {
  MOTORCYCLE = 'motorcycle',
  CUSTOMER = 'customer',
  EMPLOYEE = 'employee',
  BRANCH = 'branch',
  BRAND = 'brand',
  CATEGORY = 'category',
}

export enum ExportFormat {
  CSV = 'csv',
  EXCEL = 'excel',
  PDF = 'pdf',
}

// Validation Schemas
export const DateRangeSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});

export const ReportRequestSchema = z.object({
  branch: z.array(z.string().uuid()).optional(),
  dateRange: DateRangeSchema,
  groupBy: z.nativeEnum(GroupBy).optional(),
  filters: z.record(z.any()).optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
});

export const ExportRequestSchema = z.object({
  reportType: z.nativeEnum(ReportType),
  format: z.nativeEnum(ExportFormat),
  filters: z.object({
    branch: z.array(z.string().uuid()).optional(),
    dateRange: DateRangeSchema,
    additionalFilters: z.record(z.any()).optional(),
  }),
});

// Dashboard KPI Types
export interface SalesMetrics {
  totalRevenue: number;
  orderCount: number;
  averageOrderValue: number;
  growth: number;
  topMotorcycles: Array<{ model: string; brand: string; count: number; revenue: number }>;
}

export interface RevenueMetrics {
  grossRevenue: number;
  collectedAmount: number;
  outstandingAmount: number;
  refundAmount: number;
  netRevenue: number;
}

export interface InventoryMetrics {
  totalMotorcycles: number;
  available: number;
  reserved: number;
  sold: number;
  inTransit: number;
  inventoryValue: number;
}

export interface CustomerMetrics {
  totalActive: number;
  newCustomers: number;
  withActiveOrders: number;
  withOutstandingBalance: number;
  retentionRate: number;
}

export interface FinancingMetrics {
  activeContracts: number;
  totalFinanced: number;
  collectedAmount: number;
  outstandingBalance: number;
  overdueCount: number;
  collectionRate: number;
}

export interface ReservationMetrics {
  activeCount: number;
  conversionRate: number;
  averageDuration: number;
  totalDeposits: number;
  expiredCount: number;
}

export interface ExecutiveDashboard {
  sales: SalesMetrics;
  revenue: RevenueMetrics;
  inventory: InventoryMetrics;
  customers: CustomerMetrics;
  financing: FinancingMetrics;
  period: { start: Date; end: Date };
  branches: string[];
}

export interface OperationalDashboard {
  reservations: ReservationMetrics;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    amount: number;
    status: string;
    createdAt: Date;
  }>;
  recentPayments: Array<{
    id: string;
    paymentReference: string;
    customerName: string;
    amount: number;
    method: string;
    createdAt: Date;
  }>;
  branchPerformance: Array<{
    branchId: string;
    branchName: string;
    sales: number;
    orders: number;
    customers: number;
  }>;
}

// Report Response Types
export interface SalesSummary {
  totalSales: number;
  orderCount: number;
  averageOrderValue: number;
  cancelledCount: number;
  refundedCount: number;
  byPaymentMethod: Array<{ method: string; amount: number; count: number }>;
  byBranch: Array<{ branchId: string; branchName: string; amount: number; count: number }>;
  trends: Array<{ period: string; amount: number; count: number }>;
}

export interface AgingReport {
  total: number;
  buckets: Array<{
    label: string;
    days: string;
    amount: number;
    count: number;
    customers: Array<{
      customerId: string;
      customerName: string;
      amount: number;
      oldestInvoiceDate: Date;
    }>;
  }>;
}

export interface InventoryStatus {
  total: number;
  byStatus: Array<{ status: string; count: number; value: number }>;
  byBrand: Array<{ brand: string; count: number; value: number }>;
  byBranch: Array<{ branchId: string; branchName: string; count: number; value: number }>;
  averageAge: number;
}

export interface InstallmentPortfolio {
  activeContracts: number;
  totalFinanced: number;
  paidAmount: number;
  outstandingAmount: number;
  overdueAmount: number;
  collectionRate: number;
  byStatus: Array<{ status: string; count: number; amount: number }>;
  byAgingBucket: Array<{ bucket: string; count: number; amount: number }>;
}

export type ReportRequest = z.infer<typeof ReportRequestSchema>;
export type ExportRequest = z.infer<typeof ExportRequestSchema>;
export type DateRange = z.infer<typeof DateRangeSchema>;

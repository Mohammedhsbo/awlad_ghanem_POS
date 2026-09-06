// TASK-002: Report Query Framework utilities

import { User, Branch, Role } from '@prisma/client';
import { DateRangePreset, DateRange } from './reports.types.js';



export class ReportUtils {
  // Custom Date Utilities
  static startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  static endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  static startOfWeek = (date: Date, options?: { weekStartsOn?: number }) => {
    const d = new Date(date);
    const day = d.getDay();
    const startDay = options?.weekStartsOn ?? 0;
    const diff = d.getDate() - day + (day < startDay ? -7 : 0) + startDay;
    d.setDate(diff);
    return ReportUtils.startOfDay(d);
  };
  static endOfWeek = (date: Date, options?: { weekStartsOn?: number }) => {
    const d = ReportUtils.startOfWeek(date, options);
    d.setDate(d.getDate() + 6);
    return ReportUtils.endOfDay(d);
  };
  static startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
  static endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  static startOfQuarter = (date: Date) => new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
  static endOfQuarter = (date: Date) => new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3 + 3, 0, 23, 59, 59, 999);
  static startOfYear = (date: Date) => new Date(date.getFullYear(), 0, 1);
  static endOfYear = (date: Date) => new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
  static subDays = (date: Date, amount: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() - amount);
    return d;
  };
  static subWeeks = (date: Date, amount: number) => ReportUtils.subDays(date, amount * 7);
  static subMonths = (date: Date, amount: number) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() - amount);
    return d;
  };
  static subQuarters = (date: Date, amount: number) => ReportUtils.subMonths(date, amount * 3);
  static subYears = (date: Date, amount: number) => {
    const d = new Date(date);
    d.setFullYear(d.getFullYear() - amount);
    return d;
  };

  /**
   * Convert date range preset to actual dates
   */
  static getDateRangeFromPreset(preset: DateRangePreset, customRange?: DateRange): DateRange {
    const now = new Date();

    switch (preset) {
      case DateRangePreset.TODAY:
        return { start: ReportUtils.startOfDay(now), end: ReportUtils.endOfDay(now) };
      
      case DateRangePreset.YESTERDAY:
        const yesterday = ReportUtils.subDays(now, 1);
        return { start: ReportUtils.startOfDay(yesterday), end: ReportUtils.endOfDay(yesterday) };
      
      case DateRangePreset.THIS_WEEK:
        return { start: ReportUtils.startOfWeek(now, { weekStartsOn: 1 }), end: ReportUtils.endOfWeek(now, { weekStartsOn: 1 }) };
      
      case DateRangePreset.LAST_WEEK:
        const lastWeek = ReportUtils.subWeeks(now, 1);
        return { start: ReportUtils.startOfWeek(lastWeek, { weekStartsOn: 1 }), end: ReportUtils.endOfWeek(lastWeek, { weekStartsOn: 1 }) };
      
      case DateRangePreset.THIS_MONTH:
        return { start: ReportUtils.startOfMonth(now), end: ReportUtils.endOfMonth(now) };
      
      case DateRangePreset.LAST_MONTH:
        const lastMonth = ReportUtils.subMonths(now, 1);
        return { start: ReportUtils.startOfMonth(lastMonth), end: ReportUtils.endOfMonth(lastMonth) };
      
      case DateRangePreset.THIS_QUARTER:
        return { start: ReportUtils.startOfQuarter(now), end: ReportUtils.endOfQuarter(now) };
      
      case DateRangePreset.LAST_QUARTER:
        const lastQuarter = ReportUtils.subQuarters(now, 1);
        return { start: ReportUtils.startOfQuarter(lastQuarter), end: ReportUtils.endOfQuarter(lastQuarter) };
      
      case DateRangePreset.THIS_YEAR:
        return { start: ReportUtils.startOfYear(now), end: ReportUtils.endOfYear(now) };
      
      case DateRangePreset.LAST_YEAR:
        const lastYear = ReportUtils.subYears(now, 1);
        return { start: ReportUtils.startOfYear(lastYear), end: ReportUtils.endOfYear(lastYear) };

      case DateRangePreset.ALL_TIME:
        return { start: new Date(0), end: now };
      
      case DateRangePreset.CUSTOM:
        if (!customRange) {
          throw new Error('Custom date range required when preset is CUSTOM');
        }
        return customRange;
      
      default:
        throw new Error(`Unsupported date range preset: ${preset}`);
    }
  }

  /**
   * Get branch IDs accessible by user
   */
  static getAccessibleBranchIds(user: User & { branch?: Branch | null, role: Role }, requestedBranches?: string[]): string[] {
    if (!user.role) {
      throw new Error('User role not loaded — check JWT strategy include');
    }

    // Super admin can access all branches or requested branches
    if (user.role.name === 'super_admin') {
      return requestedBranches || [];
    }

    // Regular users can only access their branch
    if (!user.branchId) {
      throw new Error('User has no branch assignment');
    }

    // Validate requested branches match user branch
    if (requestedBranches && requestedBranches.length > 0) {
      if (!requestedBranches.includes(user.branchId)) {
        throw new Error('Unauthorized branch access');
      }
      return [user.branchId];
    }

    return [user.branchId];
  }

  /**
   * Build branch filter for Prisma queries
   */
  static buildBranchFilter(branchIds: string[]) {
    if (branchIds.length === 0) {
      return {}; // No filter for super admin viewing all
    }
    if (branchIds.length === 1) {
      return { branchId: branchIds[0] };
    }
    return { branchId: { in: branchIds } };
  }

  /**
   * Validate date range doesn't exceed maximum
   */
  static validateDateRange(dateRange: DateRange, maxDays: number = 730): void {
    const diffMs = dateRange.end.getTime() - dateRange.start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    if (diffDays > maxDays) {
      throw new Error(`Date range exceeds maximum allowed period of ${maxDays} days`);
    }
    
    if (dateRange.start > dateRange.end) {
      throw new Error('Start date must be before end date');
    }
  }

  /**
   * Calculate percentage change
   */
  static calculateGrowth(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  /**
   * Round to 2 decimal places
   */
  static round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /**
   * Convert Prisma Decimal to number
   */
  static decimalToNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    return typeof value === 'number' ? value : parseFloat(value.toString());
  }

  /**
   * Sum array of Decimal/number values
   */
  static sum(values: any[]): number {
    return values.reduce((acc, val) => acc + this.decimalToNumber(val), 0);
  }

  /**
   * Calculate average
   */
  static average(values: any[]): number {
    if (values.length === 0) return 0;
    return this.sum(values) / values.length;
  }

  static formatDate(date: Date, formatStr: string) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    if (formatStr === 'yyyy-MM-dd') return `${y}-${m}-${d}`;
    if (formatStr === 'yyyy-MM') return `${y}-${m}`;
    if (formatStr === 'yyyy-[Q]Q') return `${y}-Q${Math.floor(date.getMonth() / 3) + 1}`;
    if (formatStr === 'yyyy') return `${y}`;
    return date.toISOString();
  }
}

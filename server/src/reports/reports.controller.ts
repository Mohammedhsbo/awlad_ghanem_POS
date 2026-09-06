import {
  Inject,
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import { Resource, Action } from '@motorcycle-system/shared-types';
import { DashboardService } from './dashboard.service.js';
import { SalesService } from './sales.service.js';
import { InventoryService } from './inventory.service.js';
import { InstallmentsService } from './installments.service.js';
import { ReportUtils } from './reports.utils.js';
import { DateRangePreset, GroupBy, SalesDimension } from './reports.types.js';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    @Inject(DashboardService) private readonly dashboardService: DashboardService,
    @Inject(SalesService) private readonly salesService: SalesService,
    @Inject(InventoryService) private readonly inventoryService: InventoryService,
    @Inject(InstallmentsService) private readonly installmentsService: InstallmentsService,
  ) {}

  // Dashboard APIs
  @Get('dashboard/executive')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getExecutiveDashboard(
    @Request() req: any,
    @Query('preset') preset?: DateRangePreset,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branches') branches?: string,
  ) {
    if (!preset && (!startDate || !endDate)) {
      preset = DateRangePreset.THIS_MONTH;
    }

    const dateRange = preset
      ? ReportUtils.getDateRangeFromPreset(
          preset,
          startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined,
        )
      : { start: new Date(startDate!), end: new Date(endDate!) };

    ReportUtils.validateDateRange(dateRange, preset === DateRangePreset.ALL_TIME ? Infinity : undefined);

    const requestedBranches = branches ? branches.split(',') : undefined;
    const branchIds = ReportUtils.getAccessibleBranchIds(req.user, requestedBranches);

    return { success: true, data: await this.dashboardService.getExecutiveDashboard(req.user, dateRange, branchIds) };
  }

  @Get('dashboard/operational')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getOperationalDashboard(
    @Request() req: any,
    @Query('preset') preset?: DateRangePreset,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branches') branches?: string,
  ) {
    const dateRange = preset
      ? ReportUtils.getDateRangeFromPreset(
          preset,
          startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined,
        )
      : { start: new Date(startDate!), end: new Date(endDate!) };

    const requestedBranches = branches ? branches.split(',') : undefined;
    const branchIds = ReportUtils.getAccessibleBranchIds(req.user, requestedBranches);

    return { success: true, data: await this.dashboardService.getOperationalDashboard(req.user, dateRange, branchIds) };
  }

  // Sales Reports
  @Get('sales/summary')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getSalesSummary(
    @Request() req: any,
    @Query('preset') preset?: DateRangePreset,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branches') branches?: string,
    @Query('groupBy') groupBy?: GroupBy,
  ) {
    const dateRange = preset
      ? ReportUtils.getDateRangeFromPreset(
          preset,
          startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined,
        )
      : { start: new Date(startDate!), end: new Date(endDate!) };

    ReportUtils.validateDateRange(dateRange, preset === DateRangePreset.ALL_TIME ? Infinity : undefined);

    const requestedBranches = branches ? branches.split(',') : undefined;
    const branchIds = ReportUtils.getAccessibleBranchIds(req.user, requestedBranches);
    const branchFilter = ReportUtils.buildBranchFilter(branchIds);

    return { success: true, data: await this.salesService.getSalesSummary(branchFilter, dateRange, groupBy) };
  }

  @Get('sales/by-dimension')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getSalesByDimension(
    @Request() req: any,
    @Query('dimension') dimension: SalesDimension,
    @Query('preset') preset?: DateRangePreset,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branches') branches?: string,
    @Query('limit') limit?: string,
  ) {
    if (!dimension) {
      throw new BadRequestException('dimension query parameter is required');
    }

    const dateRange = preset
      ? ReportUtils.getDateRangeFromPreset(
          preset,
          startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined,
        )
      : { start: new Date(startDate!), end: new Date(endDate!) };

    ReportUtils.validateDateRange(dateRange, preset === DateRangePreset.ALL_TIME ? Infinity : undefined);

    const requestedBranches = branches ? branches.split(',') : undefined;
    const branchIds = ReportUtils.getAccessibleBranchIds(req.user, requestedBranches);
    const branchFilter = ReportUtils.buildBranchFilter(branchIds);

    const limitNum = limit ? parseInt(limit, 10) : 10;

    return { success: true, data: await this.salesService.getSalesByDimension(branchFilter, dateRange, dimension, limitNum) };
  }

  // Financial Reports
  @Get('financial/revenue-collection')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getRevenueCollection(
    @Request() req: any,
    @Query('preset') preset?: DateRangePreset,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branches') branches?: string,
  ) {
    const dateRange = preset
      ? ReportUtils.getDateRangeFromPreset(
          preset,
          startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined,
        )
      : { start: new Date(startDate!), end: new Date(endDate!) };

    ReportUtils.validateDateRange(dateRange, preset === DateRangePreset.ALL_TIME ? Infinity : undefined);

    const requestedBranches = branches ? branches.split(',') : undefined;
    const branchIds = ReportUtils.getAccessibleBranchIds(req.user, requestedBranches);
    const branchFilter = ReportUtils.buildBranchFilter(branchIds);

    return { success: true, data: await this.salesService.getRevenueCollection(branchFilter, dateRange) };
  }

  @Get('financial/aging')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getAgingReport(@Request() req: any, @Query('branches') branches?: string) {
    const requestedBranches = branches ? branches.split(',') : undefined;
    const branchIds = ReportUtils.getAccessibleBranchIds(req.user, requestedBranches);
    const branchFilter = ReportUtils.buildBranchFilter(branchIds);

    return { success: true, data: await this.salesService.getAgingReport(branchFilter) };
  }

  // Inventory Reports
  @Get('inventory/current-status')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getInventoryStatus(@Request() req: any, @Query('branches') branches?: string) {
    const requestedBranches = branches ? branches.split(',') : undefined;
    const branchIds = ReportUtils.getAccessibleBranchIds(req.user, requestedBranches);
    const branchFilter = ReportUtils.buildBranchFilter(branchIds);

    return { success: true, data: await this.inventoryService.getCurrentInventoryStatus(branchFilter) };
  }

  @Get('inventory/movement')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getInventoryMovement(
    @Request() req: any,
    @Query('preset') preset?: DateRangePreset,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branches') branches?: string,
  ) {
    const dateRange = preset
      ? ReportUtils.getDateRangeFromPreset(
          preset,
          startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined,
        )
      : { start: new Date(startDate!), end: new Date(endDate!) };

    const requestedBranches = branches ? branches.split(',') : undefined;
    const branchIds = ReportUtils.getAccessibleBranchIds(req.user, requestedBranches);
    const branchFilter = ReportUtils.buildBranchFilter(branchIds);

    return { success: true, data: await this.inventoryService.getInventoryMovement(branchFilter, dateRange) };
  }

  @Get('purchases/analytics')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getPurchaseAnalytics(
    @Request() req: any,
    @Query('preset') preset?: DateRangePreset,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branches') branches?: string,
  ) {
    const dateRange = preset
      ? ReportUtils.getDateRangeFromPreset(
          preset,
          startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined,
        )
      : { start: new Date(startDate!), end: new Date(endDate!) };

    const requestedBranches = branches ? branches.split(',') : undefined;
    const branchIds = ReportUtils.getAccessibleBranchIds(req.user, requestedBranches);
    const branchFilter = ReportUtils.buildBranchFilter(branchIds);

    return { success: true, data: await this.inventoryService.getPurchaseAnalytics(branchFilter, dateRange) };
  }

  @Get('suppliers/performance')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getSupplierPerformance(
    @Request() req: any,
    @Query('preset') preset?: DateRangePreset,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const dateRange = preset
      ? ReportUtils.getDateRangeFromPreset(
          preset,
          startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined,
        )
      : { start: new Date(startDate!), end: new Date(endDate!) };

    return { success: true, data: await this.inventoryService.getSupplierPerformance(dateRange) };
  }

  // Installment & Customer Reports
  @Get('installments/portfolio')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getInstallmentPortfolio(@Request() req: any, @Query('branches') branches?: string) {
    const requestedBranches = branches ? branches.split(',') : undefined;
    const branchIds = ReportUtils.getAccessibleBranchIds(req.user, requestedBranches);
    const branchFilter = ReportUtils.buildBranchFilter(branchIds);

    return { success: true, data: await this.installmentsService.getInstallmentPortfolio(branchFilter) };
  }

  @Get('installments/overdue')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getOverdueInstallments(@Request() req: any, @Query('branches') branches?: string) {
    const requestedBranches = branches ? branches.split(',') : undefined;
    const branchIds = ReportUtils.getAccessibleBranchIds(req.user, requestedBranches);
    const branchFilter = ReportUtils.buildBranchFilter(branchIds);

    return { success: true, data: await this.installmentsService.getOverdueInstallments(branchFilter) };
  }

  @Get('customers/analytics')
  @RequirePermission(Resource.REPORT, Action.READ)
  async getCustomerAnalytics(
    @Request() req: any,
    @Query('preset') preset?: DateRangePreset,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branches') branches?: string,
  ) {
    const dateRange = preset
      ? ReportUtils.getDateRangeFromPreset(
          preset,
          startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined,
        )
      : { start: new Date(startDate!), end: new Date(endDate!) };

    const requestedBranches = branches ? branches.split(',') : undefined;
    const branchIds = ReportUtils.getAccessibleBranchIds(req.user, requestedBranches);
    const branchFilter = ReportUtils.buildBranchFilter(branchIds);

    return { success: true, data: await this.installmentsService.getCustomerAnalytics(branchFilter, dateRange) };
  }
}

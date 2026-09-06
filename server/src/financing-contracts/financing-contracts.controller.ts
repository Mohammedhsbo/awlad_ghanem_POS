import {
  Inject,
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FinancingContractsService } from './financing-contracts.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import {
  CreateFinancingContractRequest,
  Resource,
  Action,
  UpdateFinancingContractRequest,
  ApproveFinancingContractRequest,
} from '@motorcycle-system/shared-types';

@Controller('financing-contracts')
@UseGuards(JwtAuthGuard)
export class FinancingContractsController {
  constructor(
    @Inject(FinancingContractsService) private readonly financingContractsService: FinancingContractsService
  ) {}

  /**
   * Create a new financing contract
   * POST /api/financing-contracts
   */
  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.FINANCING_CONTRACT, Action.CREATE)
  async create(
    @Body() dto: CreateFinancingContractRequest,
    @Req() req: any
  ) {
    const user = req.user;
    const isSuperAdmin = user.roleName === 'super_admin';

    return {
      success: true,
      data: await this.financingContractsService.create(
        dto,
        user.id,
        user.branchId,
        isSuperAdmin
      ),
    };
  }

  /**
   * List financing contracts with filtering and pagination
   * GET /api/financing-contracts
   */
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.FINANCING_CONTRACT, Action.READ)
  async findAll(@Query() query: any, @Req() req: any) {
    const user = req.user;
    const isCustomer = user.roleName === 'customer';
    const isSuperAdmin = user.roleName === 'super_admin';

    const result = await this.financingContractsService.findAll(
      query,
      user.id,
      user.branchId,
      isSuperAdmin,
      isCustomer,
      isCustomer ? user.id : undefined
    );

    return {
      success: true,
        data: result.data,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
    };
  }

  /**
   * Get a single financing contract
   * GET /api/financing-contracts/:id
   */
  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.FINANCING_CONTRACT, Action.READ)
  async findOne(@Param('id') id: string, @Req() req: any) {
    const user = req.user;
    const isCustomer = user.roleName === 'customer';
    const isSuperAdmin = user.roleName === 'super_admin';

    return {
      success: true,
      data: await this.financingContractsService.findOne(
        id,
        user.id,
        user.branchId,
        isSuperAdmin,
        isCustomer,
        isCustomer ? user.id : undefined
      ),
    };
  }

  /**
   * Update financing contract status
   * PATCH /api/financing-contracts/:id/status
   */
  @Patch(':id/status')
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.FINANCING_CONTRACT, Action.UPDATE)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFinancingContractRequest,
    @Req() req: any
  ) {
    const user = req.user;
    const isSuperAdmin = user.roleName === 'super_admin';

    return {
      success: true,
      data: await this.financingContractsService.updateStatus(
        id,
        dto,
        user.id,
        user.branchId,
        isSuperAdmin
      ),
    };
  }

  /**
   * Approve financing contract
   * PATCH /api/financing-contracts/:id/approve
   */
  @Patch(':id/approve')
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.FINANCING_CONTRACT, Action.APPROVE)
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveFinancingContractRequest,
    @Req() req: any
  ) {
    const user = req.user;
    const isSuperAdmin = user.roleName === 'super_admin';

    return {
      success: true,
      data: await this.financingContractsService.approve(
        id,
        dto,
        user.id,
        user.branchId,
        isSuperAdmin,
        user.roleName
      ),
    };
  }

  /**
   * TASK-010: Early settlement of financing contract
   * POST /api/financing-contracts/:id/settle
   */
  @Post(':id/settle')
  @UseGuards(PermissionsGuard)
  @RequirePermission(Resource.FINANCING_CONTRACT, Action.UPDATE)
  async settle(
    @Param('id') id: string,
    @Body() dto: { paymentMethod: string; reference?: string; notes?: string },
    @Req() req: any
  ) {
    const user = req.user;
    const isSuperAdmin = user.roleName === 'super_admin';

    return {
      success: true,
      data: await this.financingContractsService.settle(
        id,
        dto,
        user.id,
        user.branchId,
        isSuperAdmin
      ),
    };
  }
}

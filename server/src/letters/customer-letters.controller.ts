import {
  Inject,
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { LettersService } from './letters.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import { Resource, Action } from '@motorcycle-system/shared-types';

@Controller('customers/:customerId/letters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomerLettersController {
  constructor(@Inject(LettersService) private readonly lettersService: LettersService) {}

  /**
   * TASK-010: Get all letters for a customer
   * GET /api/customers/:customerId/letters
   */
  @Get()
  @RequirePermission(Resource.LETTER, Action.READ)
  async getCustomerLetters(@Param('customerId') customerId: string, @Request() req: any) {
    const items = await this.lettersService.getCustomerLetters(customerId, req.user);
    return {
      success: true,
      data: {
        items,
        total: items.length,
      },
    };
  }
}

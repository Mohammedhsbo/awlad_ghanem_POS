import {
  Inject,
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { LettersService } from './letters.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { LetterStatus, LetterType } from '@motorcycle-system/shared-types';

/**
 * SPEC-010 TASK-016: Customer-facing Letters API
 * Allows authenticated customers to view their own letters
 */
@Controller('customer/letters')
@UseGuards(JwtAuthGuard)
export class CustomerPortalLettersController {
  constructor(@Inject(LettersService) private readonly lettersService: LettersService) {}

  /**
   * Get all letters for the authenticated customer
   * GET /api/customer/letters
   */
  @Get()
  async getMyLetters(
    @Request() req: any,
    @Query('status') status?: LetterStatus,
    @Query('type') type?: LetterType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    const customerId = req.user.customerId;
    
    if (!customerId) {
      throw new Error('User is not associated with a customer');
    }

    const queryParams = {
      customerId,
      status,
      type,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      sort: sort as 'createdAt' | 'letterNumber' | 'issueDate' | undefined,
      order: order as 'asc' | 'desc' | undefined,
    };

    return this.lettersService.listLetters(queryParams, req.user);
  }

  /**
   * Get a specific letter by ID (only if it belongs to the authenticated customer)
   * GET /api/customer/letters/:id
   */
  @Get(':id')
  async getMyLetter(@Param('id') id: string, @Request() req: any) {
    const customerId = req.user.customerId;
    
    if (!customerId) {
      throw new Error('User is not associated with a customer');
    }

    const letter = await this.lettersService.getLetterById(id, req.user);

    // Verify the letter belongs to this customer
    if (letter.customerId !== customerId) {
      throw new Error('Unauthorized access to this letter');
    }

    return letter;
  }
}

import {
  Inject,
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import { LettersService } from './letters.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermission } from '../auth/decorators/permissions.decorator.js';
import {
  CreateLetterDto,
  ConfirmReceiptDto,
  RecordNonReceiptDto,
  UpdateLetterDto,
  LetterQueryParams,
  GenerateDocumentDto,
  LetterStatus,
  LetterType,
  Resource,
  Action,
} from '@motorcycle-system/shared-types';

@Controller('letters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LettersController {
  constructor(@Inject(LettersService) private readonly lettersService: LettersService) {}

  /**
   * TASK-005: Create letter
   * POST /api/letters
   */
  @Post()
  @RequirePermission(Resource.LETTER, Action.CREATE)
  async createLetter(@Body() dto: CreateLetterDto, @Request() req: any) {
    return this.lettersService.createLetter(dto, req.user);
  }

  /**
   * Get letter statistics
   * GET /api/letters/stats
   */
  @Get('stats')
  @RequirePermission(Resource.LETTER, Action.READ)
  async getLetterStats(@Request() req: any) {
    return this.lettersService.getLetterStats(req.user);
  }

  /**
   * TASK-005: Get letter by ID
   * GET /api/letters/:id
   */
  @Get(':id')
  @RequirePermission(Resource.LETTER, Action.READ)
  async getLetterById(@Param('id') id: string, @Request() req: any) {
    return this.lettersService.getLetterById(id, req.user);
  }

  /**
   * TASK-005: Update letter
   * PUT /api/letters/:id
   */
  @Put(':id')
  @RequirePermission(Resource.LETTER, Action.UPDATE)
  async updateLetter(
    @Param('id') id: string,
    @Body() dto: UpdateLetterDto,
    @Request() req: any,
  ) {
    return this.lettersService.updateLetter(id, dto, req.user);
  }

  /**
   * TASK-007: List letters with filtering
   * GET /api/letters
   */
  @Get()
  @RequirePermission(Resource.LETTER, Action.READ)
  async listLetters(
    @Query() query: LetterQueryParams,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Request() req: any,
  ) {
    if (page < 1 || limit < 1) {
      throw new BadRequestException('page and limit must be positive integers');
    }
    if (query.status && !Object.values(LetterStatus).includes(query.status as LetterStatus)) {
      throw new BadRequestException(`Unsupported letter status: ${query.status}`);
    }
    if (query.type && !Object.values(LetterType).includes(query.type as LetterType)) {
      throw new BadRequestException(`Unsupported letter type: ${query.type}`);
    }

    const result = await this.lettersService.listLetters({ ...query, page, limit }, req.user);
    return {
      success: true,
      data: result.letters,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }

  /**
   * TASK-006: Confirm receipt
   * POST /api/letters/:id/confirm-receipt
   */
  @Post(':id/confirm-receipt')
  @RequirePermission(Resource.LETTER, Action.CONFIRM)
  async confirmReceipt(
    @Param('id') id: string,
    @Body() dto: ConfirmReceiptDto,
    @Request() req: any,
  ) {
    return this.lettersService.confirmReceipt(id, dto, req.user);
  }

  /**
   * TASK-006: Record non-receipt
   * POST /api/letters/:id/record-non-receipt
   */
  @Post(':id/record-non-receipt')
  @RequirePermission(Resource.LETTER, Action.UPDATE)
  async recordNonReceipt(
    @Param('id') id: string,
    @Body() dto: RecordNonReceiptDto,
    @Request() req: any,
  ) {
    return this.lettersService.recordNonReceipt(id, dto, req.user);
  }

  /**
   * TASK-008: Generate document
   * POST /api/letters/:id/documents
   */
  @Post(':id/documents')
  @RequirePermission(Resource.LETTER, Action.UPDATE)
  async generateDocument(
    @Param('id') id: string,
    @Body() dto: GenerateDocumentDto,
    @Request() req: any,
  ) {
    return this.lettersService.generateDocument(id, dto, req.user);
  }

  /**
   * TASK-008: Get document URL
   * GET /api/letters/:id/documents/:documentId/url
   */
  @Get(':id/documents/:documentId/url')
  @RequirePermission(Resource.LETTER, Action.READ)
  async getDocumentUrl(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Request() req: any,
  ) {
    const url = await this.lettersService.getDocumentUrl(id, documentId, req.user);
    return { url };
  }

  /**
   * TASK-009: Get letter history
   * GET /api/letters/:id/history
   */
  @Get(':id/history')
  @RequirePermission(Resource.LETTER, Action.READ)
  async getLetterHistory(@Param('id') id: string, @Request() req: any) {
    return this.lettersService.getLetterHistory(id, req.user);
  }

}

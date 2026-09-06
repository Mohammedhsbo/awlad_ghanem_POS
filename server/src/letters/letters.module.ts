import { Module } from '@nestjs/common';
import { LettersController } from './letters.controller.js';
import { CustomerLettersController } from './customer-letters.controller.js';
import { CustomerPortalLettersController } from './customer-portal-letters.controller.js';
import { LettersService } from './letters.service.js';
import { DocumentGeneratorService } from './document-generator.service.js';
import { OrderLetterIntegrationService } from './order-letter-integration.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { UploadModule } from '../upload/upload.module.js';

@Module({
  imports: [PrismaModule, AuditModule, UploadModule],
  controllers: [LettersController, CustomerLettersController, CustomerPortalLettersController],
  providers: [LettersService, DocumentGeneratorService, OrderLetterIntegrationService],
  exports: [LettersService, OrderLetterIntegrationService],
})
export class LettersModule {}

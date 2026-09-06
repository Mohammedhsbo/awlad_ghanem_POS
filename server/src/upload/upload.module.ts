import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UploadController } from './upload.controller.js';
import { StorageService } from './storage.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UploadController],
  providers: [StorageService],
  exports: [StorageService],
})
export class UploadModule {}

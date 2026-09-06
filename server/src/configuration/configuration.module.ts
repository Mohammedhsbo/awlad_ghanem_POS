import { Module } from '@nestjs/common';
import { ConfigurationService } from './configuration.service.js';
import { FeatureFlagService } from './feature-flag.service.js';
import { ConfigurationAdminService } from './configuration-admin.service.js';
import { ConfigurationCacheService } from './configuration-cache.service.js';
import { ConfigurationController, ConfigurationAdminController } from './configuration.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ConfigurationController, ConfigurationAdminController],
  providers: [
    ConfigurationCacheService,
    ConfigurationService,
    FeatureFlagService,
    ConfigurationAdminService,
  ],
  exports: [
    ConfigurationService,
    FeatureFlagService,
    ConfigurationCacheService,
  ],
})
export class ConfigurationModule {}

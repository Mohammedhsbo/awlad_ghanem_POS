#!/usr/bin/env ts-node
/**
 * SPEC-013 TASK-017: Configuration Export/Import Tool
 * 
 * Usage:
 *   pnpm tsx src/configuration/scripts/export-config.ts --output=config-backup.json
 *   pnpm tsx src/configuration/scripts/export-config.ts --import=config-backup.json --dry-run
 *   pnpm tsx src/configuration/scripts/export-config.ts --import=config-backup.json
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ConfigurationExport {
  version: string;
  exportedAt: string;
  environment: string;
  data: {
    systemConfigurations: any[];
    companyConfigurations: any[];
    featureFlags: any[];
    documentNumbering: any[];
    workingHours: any[];
    holidays: any[];
  };
}

async function exportConfiguration(outputPath: string) {
  console.log('🔄 Exporting configuration...');

  const [
    systemConfigs,
    companyConfigs,
    featureFlags,
    numbering,
    workingHours,
    holidays,
  ] = await Promise.all([
    prisma.systemConfiguration.findMany({
      where: { isActive: true },
      select: {
        configKey: true,
        configValue: true,
        dataType: true,
        category: true,
        description: true,
        isRequired: true,
        defaultValue: true,
        validationRules: true,
      },
    }),
    prisma.companyConfiguration.findMany({
      where: { isActive: true },
      select: {
        configKey: true,
        configValue: true,
        dataType: true,
        version: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
      orderBy: [{ configKey: 'asc' }, { version: 'desc' }],
    }),
    prisma.featureFlag.findMany({
      select: {
        flagKey: true,
        flagName: true,
        description: true,
        scope: true,
        isEnabled: true,
        rolloutPercentage: true,
        targetBranches: true,
        environment: true,
      },
    }),
    prisma.documentNumbering.findMany({
      select: {
        documentType: true,
        prefix: true,
        includeBranchCode: true,
        includeYear: true,
        sequenceLength: true,
        currentSequence: true,
        resetPolicy: true,
        branchId: true,
      },
    }),
    prisma.workingHours.findMany({
      select: {
        branchId: true,
        dayOfWeek: true,
        isClosed: true,
        openTime: true,
        closeTime: true,
        isActive: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    }),
    prisma.holiday.findMany({
      where: { isActive: true },
      select: {
        holidayName: true,
        holidayDate: true,
        scope: true,
        branchId: true,
        isRecurring: true,
        recurrencePattern: true,
      },
    }),
  ]);

  const exportData: ConfigurationExport = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    data: {
      systemConfigurations: systemConfigs,
      companyConfigurations: companyConfigs,
      featureFlags,
      documentNumbering: numbering,
      workingHours,
      holidays,
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  
  console.log('✅ Configuration exported successfully!');
  console.log(`📄 Output file: ${outputPath}`);
  console.log(`📊 Summary:`);
  console.log(`   - System Configurations: ${systemConfigs.length}`);
  console.log(`   - Company Configurations: ${companyConfigs.length}`);
  console.log(`   - Feature Flags: ${featureFlags.length}`);
  console.log(`   - Document Numbering Rules: ${numbering.length}`);
  console.log(`   - Working Hours: ${workingHours.length}`);
  console.log(`   - Holidays: ${holidays.length}`);
}

async function importConfiguration(inputPath: string, dryRun: boolean) {
  console.log(`🔄 ${dryRun ? 'DRY RUN:' : ''} Importing configuration...`);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const fileContent = fs.readFileSync(inputPath, 'utf-8');
  const importData: ConfigurationExport = JSON.parse(fileContent);

  console.log(`📄 Import file: ${inputPath}`);
  console.log(`📅 Exported at: ${importData.exportedAt}`);
  console.log(`🏷️  Environment: ${importData.environment}`);
  console.log(`📊 Summary:`);
  console.log(`   - System Configurations: ${importData.data.systemConfigurations.length}`);
  console.log(`   - Company Configurations: ${importData.data.companyConfigurations.length}`);
  console.log(`   - Feature Flags: ${importData.data.featureFlags.length}`);
  console.log(`   - Document Numbering Rules: ${importData.data.documentNumbering.length}`);
  console.log(`   - Working Hours: ${importData.data.workingHours.length}`);
  console.log(`   - Holidays: ${importData.data.holidays.length}`);

  if (dryRun) {
    console.log('\n✅ Dry run completed. No changes made.');
    return;
  }

  console.log('\n⚠️  WARNING: This will overwrite existing configurations!');
  console.log('Proceeding with import in 3 seconds...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Import in transaction
  await prisma.$transaction(async (tx) => {
    // Import system configurations
    for (const config of importData.data.systemConfigurations) {
      await tx.systemConfiguration.upsert({
        where: { configKey: config.configKey },
        update: {
          configValue: config.configValue,
          dataType: config.dataType,
          category: config.category,
          description: config.description,
          updatedAt: new Date(),
        },
        create: {
          ...config,
          id: undefined,
          createdBy: 'system', // TODO: Use actual admin user ID
        },
      });
    }

    // Import company configurations
    for (const config of importData.data.companyConfigurations) {
      await tx.companyConfiguration.create({
        data: {
          ...config,
          id: undefined,
          createdBy: 'system', // TODO: Use actual admin user ID
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    // Import feature flags
    for (const flag of importData.data.featureFlags) {
      await tx.featureFlag.upsert({
        where: { flagKey: flag.flagKey },
        update: {
          flagName: flag.flagName,
          description: flag.description,
          scope: flag.scope,
          isEnabled: flag.isEnabled,
          rolloutPercentage: flag.rolloutPercentage,
          targetBranches: flag.targetBranches as any,
          environment: flag.environment,
          updatedAt: new Date(),
        },
        create: {
          ...flag,
          id: undefined,
          targetBranches: flag.targetBranches as any,
          createdBy: 'system', // TODO: Use actual admin user ID
        },
      });
    }

    console.log('✅ Configuration imported successfully!');
  });
}

async function main() {
  const args = process.argv.slice(2);
  const outputArg = args.find(arg => arg.startsWith('--output='));
  const importArg = args.find(arg => arg.startsWith('--import='));
  const dryRun = args.includes('--dry-run');

  try {
    if (outputArg) {
      const outputPath = outputArg.split('=')[1];
      await exportConfiguration(outputPath);
    } else if (importArg) {
      const inputPath = importArg.split('=')[1];
      await importConfiguration(inputPath, dryRun);
    } else {
      console.log('Usage:');
      console.log('  Export: pnpm tsx src/configuration/scripts/export-config.ts --output=config-backup.json');
      console.log('  Import (dry-run): pnpm tsx src/configuration/scripts/export-config.ts --import=config-backup.json --dry-run');
      console.log('  Import: pnpm tsx src/configuration/scripts/export-config.ts --import=config-backup.json');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

import { IsString, IsEnum, IsOptional, IsBoolean, IsDate, IsObject, IsArray, ValidateNested, IsInt, Min, Max, Matches, ValidateIf, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ConfigDataType } from '../configuration.types.js';

export class ConfigurationUpdateItemDto {
  @IsString()
  configKey: string;

  @IsString()
  configValue: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveTo?: Date;
}

export class UpdateSystemConfigurationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfigurationUpdateItemDto)
  configurations: ConfigurationUpdateItemDto[];
}

export class UpdateCompanyConfigurationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfigurationUpdateItemDto)
  configurations: ConfigurationUpdateItemDto[];
}

export class UpdateBranchConfigurationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfigurationUpdateItemDto)
  configurations: ConfigurationUpdateItemDto[];
}

export class FeatureFlagUpdateDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercentage?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetBranches?: string[];

  @IsOptional()
  @IsString()
  reason?: string;
}

export class DocumentNumberingUpdateDto {
  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @IsBoolean()
  includeBranchCode?: boolean;

  @IsOptional()
  @IsBoolean()
  includeYear?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  sequenceLength?: number;

  @IsOptional()
  @IsEnum(['never', 'yearly', 'monthly'])
  resetPolicy?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class WorkingHoursUpdateDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ValidateIf(dto => !dto.isClosed)
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'openTime must use HH:mm format' })
  openTime?: string;

  @ValidateIf(dto => !dto.isClosed)
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'closeTime must use HH:mm format' })
  closeTime?: string;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;

  @Type(() => Date)
  @IsDate()
  effectiveFrom: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveTo?: Date;
}

export class CreateHolidayDto {
  @IsString()
  holidayName: string;

  @Type(() => Date)
  @IsDate()
  holidayDate: Date;

  @IsEnum(['system', 'branch'])
  scope: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  recurrencePattern?: string;
}

export class ResetNumberingDto {
  @IsInt()
  @Min(0)
  newStartingNumber: number;

  @IsString()
  reason: string;

  @IsBoolean()
  confirmed: boolean;
}

import { IsString, IsOptional, IsBoolean, IsArray, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ConfigurationQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  keys?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  include_inactive?: boolean;
}

export class ResolvedConfigurationQueryDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  keys?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  branch_override?: boolean;
}

export class FeatureFlagQueryDto {
  @IsOptional()
  @IsEnum(['system', 'branch', 'user'])
  scope?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  enabled_only?: boolean;

  @IsOptional()
  @IsString()
  branch?: string;
}

export class DocumentNumberingQueryDto {
  @IsOptional()
  @IsString()
  document_type?: string;

  @IsOptional()
  @IsString()
  branch?: string;
}

export class ConfigurationAuditQueryDto {
  @IsOptional()
  @IsString()
  config_type?: string;

  @IsOptional()
  @IsString()
  config_key?: string;

  @IsOptional()
  @IsString()
  branch_id?: string;

  @IsOptional()
  @Type(() => Date)
  from_date?: Date;

  @IsOptional()
  @Type(() => Date)
  to_date?: Date;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;
}

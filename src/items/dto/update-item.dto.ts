import { IsInt, IsNumberString, IsOptional, IsString, Min } from 'class-validator';

export class UpdateItemDto {
  @IsOptional() @IsInt() brandId?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() dimension?: string;
  @IsOptional() @IsString() finishFabric?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() subCategory?: string;
  @IsOptional() @IsNumberString({ no_symbols: true }) unitPrice?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsInt() @Min(0) lowStockThreshold?: number;
  @IsOptional() @IsString() notes?: string;
}

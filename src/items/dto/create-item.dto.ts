import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value.trim().toUpperCase())
  code!: string;
  @IsOptional() @IsInt() brandId?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() dimension?: string;
  @IsOptional() @IsString() finishFabric?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() subCategory?: string;
  @IsOptional() @IsInt() @Min(0) initialQty?: number;
  @IsOptional() @IsInt() @Min(1) initialLocationId?: number;
  @IsOptional() @IsNumberString({ no_symbols: true }) unitPrice?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsInt() @Min(0) lowStockThreshold?: number;
  @IsOptional() @IsString() notes?: string;
}

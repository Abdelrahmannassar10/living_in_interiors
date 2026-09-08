import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SearchItemDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() category?: string;
  // Accepts the strings "true"/"false" — @Type(() => Boolean) turns "false" into true, so transform manually.
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  inStock?: boolean;
  @IsOptional() @IsIn(['code', 'unitPrice', 'brand']) sortBy = 'code';
  @IsOptional() @IsIn(['ASC', 'DESC']) sortOrder: 'ASC' | 'DESC' = 'ASC';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

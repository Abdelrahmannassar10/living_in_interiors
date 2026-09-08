import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseOrderDto {
  @IsInt() @IsPositive() supplierId!: number;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  lines!: CreatePurchaseOrderLineDto[];
}

export class CreatePurchaseOrderLineDto {
  @IsString() @IsNotEmpty() itemCode!: string;
  @IsInt() @IsPositive() qty!: number;
  @IsOptional() @IsNumber() @Min(0) unitCost?: number;
}

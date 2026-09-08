import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSalesOrderLineDto {
  @IsOptional() @IsString() @IsNotEmpty() itemCode?: string;
  @IsOptional() @IsInt() @IsPositive() qty?: number;
  @IsOptional() @IsNumber() unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

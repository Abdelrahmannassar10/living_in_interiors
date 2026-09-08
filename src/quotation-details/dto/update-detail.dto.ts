import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateQuotationDetailDto {
  @IsOptional() @IsInt() @IsPositive() qty?: number;
  @IsOptional() @IsNumber() unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsString() notes?: string;
}

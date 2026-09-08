import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsNumberString,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Invoice generated from a Delivered or Closed sales order. */
export class CreateInvoiceFromOrderDto {
  @IsInt() @IsPositive() salesOrderId!: number;
}

/** Manual invoice line — qty/unitPrice may be negative for credit notes. */
export class ManualInvoiceLineDto {
  /** Existing item to snapshot code/description (optional for free text). */
  @IsOptional() @IsString() itemCode?: string;
  @IsOptional() @IsString() @MinLength(1) description?: string;
  @IsInt() qty!: number;
  @IsNumberString() unitPrice!: string;
  @IsOptional() @IsNumberString() discountPercent?: string;
}

/** Manual invoice — totals are computed server-side (client cannot set totals). */
export class CreateManualInvoiceDto {
  /** Existing client, or an explicit name snapshot for one-off customers. */
  @IsOptional() @IsInt() @IsPositive() clientId?: number;
  @IsOptional() @IsString() @MinLength(1) clientName?: string;
  @IsOptional() @IsDateString() invoiceDate?: string;
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ManualInvoiceLineDto)
  lines!: ManualInvoiceLineDto[];
  @IsOptional() @IsNumberString() discountGlobalPercent?: string;
  @IsOptional() @IsNumberString() vatPercent?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() notes?: string;
}

import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSalesOrderDto {
  @IsOptional() @IsInt() clientId?: number;
  @IsOptional() @IsString() @MaxLength(200) clientName?: string;
  @IsOptional() @IsString() @MaxLength(200) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsDateString() expectedDeliveryDate?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountGlobal?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatPercent?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() internalNotes?: string;
}

export class CreateSalesOrderFromQuotationDto {
  @IsInt() @IsNotEmpty() quotationId!: number;
}

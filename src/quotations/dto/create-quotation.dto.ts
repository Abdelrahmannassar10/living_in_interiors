import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
export class CreateQuotationDto {
  @IsOptional() @Type(() => Number) @IsInt() clientId?: number;
  @IsOptional() @IsString() clientName?: string;
  @IsOptional() @IsString() projectName?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() internalNotes?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  @Max(100)
  discountGlobal?: number;
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPercent?: number;
  @IsOptional() @IsString() currency?: string;
}

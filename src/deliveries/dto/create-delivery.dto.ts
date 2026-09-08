import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDeliveryLineDto {
  @IsInt() @IsPositive() salesOrderLineId!: number;
  @IsInt() @IsPositive() qty!: number;
}

export class CreateDeliveryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDeliveryLineDto)
  lines!: CreateDeliveryLineDto[];
  @IsOptional() @IsDateString() deliveredAt?: string;
  @IsOptional() @IsString() notes?: string;
}

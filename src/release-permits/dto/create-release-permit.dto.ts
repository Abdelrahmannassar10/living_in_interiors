import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateReleasePermitLineDto {
  @IsInt()
  @IsPositive()
  salesOrderLineId!: number;

  @IsInt()
  @IsPositive()
  qty!: number;
}

export class CreateReleasePermitDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  salesOrderId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateReleasePermitLineDto)
  lines!: CreateReleasePermitLineDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;
}

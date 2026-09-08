import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ReturnToSupplierDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReturnToSupplierLineDto)
  lines!: ReturnToSupplierLineDto[];
  @IsOptional() @IsString() notes?: string;
}

export class ReturnToSupplierLineDto {
  /** Purchase order line id. */
  @IsInt() @IsPositive() lineId!: number;
  @IsInt() @IsPositive() qty!: number;
  /** Physical location the goods are sent back from. */
  @IsInt() @IsPositive() fromLocationId!: number;
}

import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ReceiveGoodsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReceiveGoodsLineDto)
  lines!: ReceiveGoodsLineDto[];
  @IsOptional() @IsDateString() receivedAt?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ReceiveGoodsLineDto {
  /** Purchase order line id. */
  @IsInt() @IsPositive() lineId!: number;
  @IsInt() @IsPositive() qty!: number;
  /** Location the goods are received into. */
  @IsInt() @IsPositive() toLocationId!: number;
}

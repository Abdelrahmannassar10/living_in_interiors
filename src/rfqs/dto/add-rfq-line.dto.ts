import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class AddRfqLineDto {
  @IsInt()
  @IsPositive()
  rfqId!: number;

  @IsString()
  @IsNotEmpty()
  itemCode!: string;

  @IsInt()
  @IsPositive()
  qty!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

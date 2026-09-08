import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
export class CreateSaleDto {
  @IsString() @IsNotEmpty() itemCode!: string;
  @IsInt() @IsPositive() fromLocationId!: number;
  @IsInt() @IsPositive() qty!: number;
  @IsString() @IsNotEmpty() customerName!: string;
  @IsOptional() @IsString() referenceNo?: string;
  @IsOptional() @IsString() notes?: string;
}

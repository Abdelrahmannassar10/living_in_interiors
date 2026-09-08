import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  ValidateIf,
} from 'class-validator';
export class CreateSaleDto {
  @IsString() @IsNotEmpty() itemCode!: string;
  @ValidateIf((o: CreateSaleDto) => !o.salesOrderId)
  @IsInt()
  @IsPositive()
  fromLocationId!: number;
  @IsInt() @IsPositive() qty!: number;
  @IsString() @IsNotEmpty() customerName!: string;
  @IsOptional() @IsString() referenceNo?: string;
  /** When present, the sale consumes the confirmed order's reserved stock instead of an arbitrary location. */
  @IsOptional() @IsInt() @IsPositive() salesOrderId?: number;
  @IsOptional() @IsString() notes?: string;
}

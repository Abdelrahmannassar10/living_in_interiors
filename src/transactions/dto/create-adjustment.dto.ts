import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import {
  AdjustmentReason,
  AdjustmentType,
} from '../../common/enums/transaction-type.enum';
export class CreateAdjustmentDto {
  @IsString() @IsNotEmpty() itemCode!: string;
  @IsEnum(AdjustmentType) adjustmentType!: AdjustmentType;
  @IsEnum(AdjustmentReason) adjustmentReason!: AdjustmentReason;
  @IsInt() @IsPositive() locationId!: number;
  @IsInt() @IsPositive() qty!: number;
  @IsOptional() @IsString() notes?: string;
}

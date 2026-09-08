import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
export class CreateReturnDto {
  @IsString() @IsNotEmpty() itemCode!: string;
  @IsInt() @IsPositive() toLocationId!: number;
  @IsInt() @IsPositive() qty!: number;
  @IsString() @IsNotEmpty() customerName!: string;
  @IsOptional() @IsString() referenceNo?: string;
  @IsOptional() @IsString() notes?: string;
}

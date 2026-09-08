import {
  IsDateString,
  IsInt,
  IsNumberString,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreatePaymentDto {
  @IsInt() @IsPositive() clientId!: number;
  @IsNumberString() amount!: string;
  @IsOptional() @IsDateString() paymentDate?: string;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() referenceNo?: string;
  @IsOptional() @IsString() notes?: string;
}

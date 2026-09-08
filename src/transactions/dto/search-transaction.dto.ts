import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TransactionType } from '../../common/enums/transaction-type.enum';

export class TransactionSearchDto extends PaginationDto {
  @IsOptional() @IsEnum(TransactionType) type?: TransactionType;
  @IsOptional() @Type(() => String) @IsString() itemCode?: string;
}

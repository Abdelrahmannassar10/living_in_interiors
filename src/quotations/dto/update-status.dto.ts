import { IsEnum } from 'class-validator';
import { QuotationStatus } from '../../common/enums/quotation-status.enum';
export class UpdateStatusDto { @IsEnum(QuotationStatus) status!: QuotationStatus; }
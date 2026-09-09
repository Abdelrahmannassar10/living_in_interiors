import { IsEnum } from 'class-validator';
import { RfqStatus } from '../../common/enums/rfq-status.enum';

export class UpdateRfqStatusDto {
  @IsEnum(RfqStatus)
  status!: RfqStatus;
}

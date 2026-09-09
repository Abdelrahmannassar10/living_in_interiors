import { IsEnum } from 'class-validator';
import { ReleasePermitStatus } from '../../common/enums/release-permit-status.enum';

export class UpdateReleasePermitStatusDto {
  @IsEnum(ReleasePermitStatus)
  status!: ReleasePermitStatus;
}

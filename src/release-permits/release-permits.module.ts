import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NumberingService } from '../common/services/numbering.service';
import { ReleasePermit } from './entities/release-permit.entity';
import { ReleasePermitLine } from './entities/release-permit-line.entity';
import { ReleasePermitsController } from './release-permits.controller';
import { ReleasePermitsService } from './release-permits.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReleasePermit, ReleasePermitLine])],
  controllers: [ReleasePermitsController],
  providers: [ReleasePermitsService, NumberingService],
  exports: [ReleasePermitsService],
})
export class ReleasePermitsModule {}

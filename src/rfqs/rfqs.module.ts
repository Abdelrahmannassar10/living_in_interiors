import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NumberingService } from '../common/services/numbering.service';
import { ItemsModule } from '../items/items.module';
import { Rfq } from './entities/rfq.entity';
import { RfqLine } from './entities/rfq-line.entity';
import { RfqsController } from './rfqs.controller';
import { RfqsService } from './rfqs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Rfq, RfqLine]), ItemsModule],
  controllers: [RfqsController],
  providers: [RfqsService, NumberingService],
  exports: [RfqsService],
})
export class RfqsModule {}

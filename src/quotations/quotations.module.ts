import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NumberingService } from '../common/services/numbering.service';
import { QuotationDetail } from '../quotation-details/entities/quotation-detail.entity';
import { Quotation } from './entities/quotation.entity';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
@Module({
  imports: [TypeOrmModule.forFeature([Quotation, QuotationDetail])],
  controllers: [QuotationsController],
  providers: [QuotationsService, NumberingService],
  exports: [QuotationsService],
})
export class QuotationsModule {}

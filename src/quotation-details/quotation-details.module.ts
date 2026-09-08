import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemsModule } from '../items/items.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { Quotation } from '../quotations/entities/quotation.entity';
import { QuotationDetail } from './entities/quotation-detail.entity';
import { QuotationDetailsController } from './quotation-details.controller';
import { QuotationDetailsService } from './quotation-details.service';
@Module({
  imports: [TypeOrmModule.forFeature([QuotationDetail, Quotation]), ItemsModule, QuotationsModule],
  controllers: [QuotationDetailsController],
  providers: [QuotationDetailsService],
  exports: [QuotationDetailsService],
})
export class QuotationDetailsModule {}

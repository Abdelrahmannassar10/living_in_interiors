import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotationsModule } from '../quotations/quotations.module';
import { ItemStock } from '../items/entities/item-stock.entity';
import { SupplierPriceList } from '../purchase-orders/entities/supplier-price-list.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    forwardRef(() => QuotationsModule),
    TypeOrmModule.forFeature([ItemStock, SupplierPriceList]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsModule } from '../transactions/transactions.module';
import { NumberingService } from '../common/services/numbering.service';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Item } from '../items/entities/item.entity';
import { ItemStock } from '../items/entities/item-stock.entity';
import { Brand } from '../brands/entities/brand.entity';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderLine } from './entities/purchase-order-line.entity';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptLine } from './entities/goods-receipt-line.entity';
import { SupplierPriceList } from './entities/supplier-price-list.entity';
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  GoodsReceiptsController,
  PurchaseOrdersController,
} from './purchase-orders.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseOrderLine,
      GoodsReceipt,
      GoodsReceiptLine,
      SupplierPriceList,
      Supplier,
      Item,
      ItemStock,
      Brand,
    ]),
    TransactionsModule,
  ],
  controllers: [PurchaseOrdersController, GoodsReceiptsController],
  providers: [PurchaseOrdersService, NumberingService],
})
export class PurchaseOrdersModule {}

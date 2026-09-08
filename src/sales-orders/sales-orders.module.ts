import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { ItemsModule } from '../items/items.module';
import { ItemStock } from '../items/entities/item-stock.entity';
import { Location } from '../locations/entities/location.entity';
import { NumberingService } from '../common/services/numbering.service';
import { Quotation } from '../quotations/entities/quotation.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { SalesOrderLine } from './entities/sales-order-line.entity';
import { SalesOrder } from './entities/sales-order.entity';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersService } from './sales-orders.service';
import { DeliveriesModule } from '../deliveries/deliveries.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesOrder,
      SalesOrderLine,
      Quotation,
      Reservation,
      ItemStock,
      Location,
      Client,
    ]),
    ItemsModule,
    DeliveriesModule,
  ],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService, NumberingService],
  exports: [SalesOrdersService],
})
export class SalesOrdersModule {}

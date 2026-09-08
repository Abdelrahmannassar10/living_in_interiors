import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NumberingService } from '../common/services/numbering.service';
import { Item } from '../items/entities/item.entity';
import { ItemStock } from '../items/entities/item-stock.entity';
import { SalesOrderLine } from '../sales-orders/entities/sales-order-line.entity';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { ReportsModule } from '../reports/reports.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { DeliveryLine } from './entities/delivery-line.entity';
import { Delivery } from './entities/delivery.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Delivery,
      DeliveryLine,
      SalesOrder,
      SalesOrderLine,
      Reservation,
      Item,
      ItemStock,
    ]),
    ReportsModule,
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, NumberingService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}

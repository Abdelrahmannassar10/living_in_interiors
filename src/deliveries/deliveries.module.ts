import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../items/entities/item.entity';
import { ItemStock } from '../items/entities/item-stock.entity';
import { NumberingService } from '../common/services/numbering.service';
import { Reservation } from '../reservations/entities/reservation.entity';
import { SalesOrderLine } from '../sales-orders/entities/sales-order-line.entity';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { DeliveryLine } from './entities/delivery-line.entity';
import { Delivery } from './entities/delivery.entity';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

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
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, NumberingService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}

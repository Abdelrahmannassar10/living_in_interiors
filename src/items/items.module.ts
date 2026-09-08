import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GatewayModule } from '../gateway/gateway.module';
import { StockAlertsModule } from '../stock-alerts/stock-alerts.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ItemPhoto } from './entities/item-photo.entity';
import { ItemStock } from './entities/item-stock.entity';
import { Item } from './entities/item.entity';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Item, ItemPhoto, ItemStock]),
    UploadsModule,
    GatewayModule,
    StockAlertsModule,
  ],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GatewayModule } from '../gateway/gateway.module';
import { Item } from '../items/entities/item.entity';
import { StockAlertConfig } from './entities/stock-alert-config.entity';
import { StockAlertsController } from './stock-alerts.controller';
import { StockAlertsService } from './stock-alerts.service';
@Module({
  imports: [TypeOrmModule.forFeature([StockAlertConfig, Item]), GatewayModule],
  controllers: [StockAlertsController],
  providers: [StockAlertsService],
  exports: [StockAlertsService],
})
export class StockAlertsModule {}

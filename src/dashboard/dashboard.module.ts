import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { Item } from '../items/entities/item.entity';
import { Quotation } from '../quotations/entities/quotation.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
@Module({
  imports: [TypeOrmModule.forFeature([Item, Quotation, Client, Transaction])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

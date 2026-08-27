import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../items/entities/item.entity';
import { Location } from '../locations/entities/location.entity';
import { Transaction } from './entities/transaction.entity';
import { InventoryService } from './inventory.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({ imports: [TypeOrmModule.forFeature([Transaction, Item, Location])], controllers: [TransactionsController], providers: [InventoryService, TransactionsService], exports: [InventoryService, TransactionsService] })
export class TransactionsModule {}
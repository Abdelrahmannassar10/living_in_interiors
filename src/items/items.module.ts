import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemPhoto } from './entities/item-photo.entity';
import { Item } from './entities/item.entity';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({ imports: [TypeOrmModule.forFeature([Item, ItemPhoto])], controllers: [ItemsController], providers: [ItemsService], exports: [ItemsService] })
export class ItemsModule {}
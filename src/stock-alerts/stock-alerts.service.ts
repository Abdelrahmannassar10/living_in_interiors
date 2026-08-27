import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { ItemsService } from '../items/items.service';
import { SetAlertConfigDto } from './dto/set-alert-config.dto';
import { StockAlertConfig } from './entities/stock-alert-config.entity';

@Injectable()
export class StockAlertsService {
  constructor(@InjectRepository(StockAlertConfig) private readonly configs: Repository<StockAlertConfig>, @InjectRepository(Item) private readonly items: Repository<Item>, private readonly itemsService: ItemsService) {}
  async getConfig(itemId: number) { const item = await this.items.findOneBy({ id: itemId }); if (!item) throw new NotFoundException('Item not found'); let config = await this.configs.findOne({ where: { item: { id: itemId } } }); if (!config) config = await this.configs.save(this.configs.create({ item, threshold: item.lowStockThreshold, isEnabled: true })); return config; }
  async setConfig(itemId: number, dto: SetAlertConfigDto) { const config = await this.getConfig(itemId); Object.assign(config, dto); return this.configs.save(config); }
  async getAllAlertingItems() { const items = await this.items.find({ where: { isActive: true }, relations: ['brand'] }); return items.filter((item) => item.qtyShowroom + item.qtyStorage1 + item.qtyStorage2 <= item.lowStockThreshold); }
  async checkAndAlert(itemId: number): Promise<void> { const item = await this.itemsService.findOneById(itemId); const config = await this.getConfig(itemId); const total = item.qtyShowroom + item.qtyStorage1 + item.qtyStorage2; if (config.isEnabled && total <= config.threshold) { config.lastAlertedAt = new Date(); await this.configs.save(config); } }
}
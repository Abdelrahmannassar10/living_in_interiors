import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { Item } from '../items/entities/item.entity';
import { ItemStock } from '../items/entities/item-stock.entity';
import { AppGateway } from '../gateway/app.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { SetAlertConfigDto } from './dto/set-alert-config.dto';
import { StockAlertConfig } from './entities/stock-alert-config.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

/** Hours before the same item may alert again. */
const ALERT_QUIET_HOURS = 6;

@Injectable()
export class StockAlertsService {
  constructor(
    @InjectRepository(StockAlertConfig)
    private readonly configs: Repository<StockAlertConfig>,
    @InjectRepository(Item) private readonly items: Repository<Item>,
    private readonly gateway: AppGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async getConfig(itemId: number) {
    const item = await this.items.findOneBy({ id: itemId });
    if (!item) throw new NotFoundException('Item not found');
    let config = await this.configs.findOne({
      where: { item: { id: itemId } },
    });
    if (!config)
      config = await this.configs.save(
        this.configs.create({
          item,
          threshold: item.lowStockThreshold,
          isEnabled: true,
        }),
      );
    return config;
  }

  async setConfig(itemId: number, dto: SetAlertConfigDto) {
    const config = await this.getConfig(itemId);
    Object.assign(config, dto);
    return this.configs.save(config);
  }

  /** All active items whose availability is at or below their effective threshold — computed in SQL. */
  async getAllAlerting() {
    const rows: Array<{
      item_id: string;
      code: string;
      description: string | null;
      available: string;
      threshold: string;
    }> = await this.items
      .createQueryBuilder('item')
      .innerJoin(
        (qb) =>
          qb
            .select('s.item_id', 'item_id')
            .addSelect('SUM(s.qty_on_hand) - SUM(s.qty_reserved)', 'available')
            .from(ItemStock, 's')
            .groupBy('s.item_id'),
        'stock_sum',
        'stock_sum.item_id = item.id',
      )
      .select('item.id', 'item_id')
      .addSelect('item.code', 'code')
      .addSelect('item.description', 'description')
      .addSelect('CAST(stock_sum.available AS INTEGER)', 'available')
      .addSelect('item.low_stock_threshold', 'threshold')
      .where('item.is_active = true')
      .andWhere(
        'CAST(stock_sum.available AS INTEGER) <= item.low_stock_threshold',
      )
      .orderBy('item.code', 'ASC')
      .getRawMany();
    return rows.map((row) => ({
      itemId: Number(row.item_id),
      code: row.code,
      description: row.description,
      available: Number(row.available),
      threshold: Number(row.threshold),
    }));
  }

  /**
   * Called after each committed transaction: if the item's availability dropped to
   * or below its threshold, emits a realtime alert (deduplicated by a quiet period
   * so a low item does not alert on every subsequent movement).
   */
  async evaluateAfterTransaction(transaction: Transaction): Promise<void> {
    try {
      const item = await this.items.findOne({
        where: { id: transaction.item.id },
        relations: ['brand'],
      });
      if (!item) return;
      const config = await this.getConfig(item.id);
      if (!config.isEnabled) return;
      const result = await this.items
        .createQueryBuilder('item')
        .innerJoin(
          (qb) =>
            qb
              .select('s.item_id', 'item_id')
              .addSelect(
                'SUM(s.qty_on_hand) - SUM(s.qty_reserved)',
                'available',
              )
              .from(ItemStock, 's')
              .where('s.item_id = :itemId')
              .groupBy('s.item_id'),
          'stock_sum',
          'stock_sum.item_id = item.id',
        )
        .select('stock_sum.available', 'available')
        .where('item.id = :itemId', { itemId: item.id })
        .getRawOne<{ available: string }>();
      const available = Number(result?.available ?? 0);
      if (available > config.threshold) return;
      const quietMs = ALERT_QUIET_HOURS * 60 * 60 * 1000;
      const lastAlerted = config.lastAlertedAt?.getTime() ?? 0;
      if (Date.now() - lastAlerted < quietMs) return;
      config.lastAlertedAt = new Date();
      await this.configs.save(config);
      this.gateway.emitStockAlert(
        item.code,
        item.description,
        available,
        config.threshold,
      );
      await this.notifications.createForRoles(
        'stock-low',
        {
          itemId: item.id,
          itemCode: item.code,
          available,
          threshold: config.threshold,
        },
        [Role.Admin, Role.Manager],
      );
    } catch {
      // Alerting must never fail the transaction flow.
    }
  }
}

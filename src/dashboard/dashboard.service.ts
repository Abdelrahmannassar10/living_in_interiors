import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Item } from '../items/entities/item.entity';
import { ItemStock } from '../items/entities/item-stock.entity';
import { Quotation } from '../quotations/entities/quotation.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(Quotation)
    private readonly quotations: Repository<Quotation>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
  ) {}

  /** All aggregates computed in SQL — no full-table loads into JS. */
  async summary() {
    const [totalItems, totalActiveItems, totalQuotations, totalClients] =
      await Promise.all([
        this.items.count(),
        this.items.count({ where: { isActive: true } }),
        this.quotations.count(),
        this.clients.count({ where: { isActive: true } }),
      ]);

    const stockAgg = await this.items
      .createQueryBuilder('item')
      .innerJoin(
        (qb) =>
          qb
            .select('s.item_id', 'item_id')
            .addSelect('SUM(s.qty_on_hand) - SUM(s.qty_reserved)', 'available')
            .addSelect('SUM(s.qty_on_hand)', 'on_hand')
            .from(ItemStock, 's')
            .groupBy('s.item_id'),
        'stock_sum',
        'stock_sum.item_id = item.id',
      )
      .where('item.is_active = true')
      .select(
        'COUNT(*) FILTER (WHERE stock_sum.available <= item.low_stock_threshold)',
        'low_stock_count',
      )
      .addSelect(
        'COALESCE(SUM(stock_sum.on_hand * COALESCE(item.unit_price, 0)), 0)',
        'inventory_value',
      )
      .getRawOne<{ low_stock_count: string; inventory_value: string }>();

    return {
      totalItems,
      totalActiveItems,
      totalQuotations,
      totalClients,
      lowStockCount: Number(stockAgg?.low_stock_count ?? 0),
      totalInventoryValue: Number(stockAgg?.inventory_value ?? 0),
    };
  }

  recentTransactions() {
    return this.transactions.find({
      relations: ['item', 'fromLocation', 'toLocation'],
      order: { transactionDate: 'DESC' },
      take: 10,
    });
  }
}

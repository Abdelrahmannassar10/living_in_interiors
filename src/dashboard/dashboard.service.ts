import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Item } from '../items/entities/item.entity';
import { Quotation } from '../quotations/entities/quotation.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

@Injectable()
export class DashboardService {
  constructor(@InjectRepository(Item) private readonly items: Repository<Item>, @InjectRepository(Quotation) private readonly quotations: Repository<Quotation>, @InjectRepository(Client) private readonly clients: Repository<Client>, @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>) {}
  async summary() { const [totalItems, totalActiveItems, totalQuotations, totalClients] = await Promise.all([this.items.count(), this.items.count({ where: { isActive: true } }), this.quotations.count(), this.clients.count({ where: { isActive: true } })]); const items = await this.items.find({ where: { isActive: true } }); return { totalItems, totalActiveItems, totalQuotations, totalClients, lowStockCount: items.filter((item) => item.qtyShowroom + item.qtyStorage1 + item.qtyStorage2 <= item.lowStockThreshold).length, totalInventoryValue: items.reduce((sum, item) => sum + (item.qtyShowroom + item.qtyStorage1 + item.qtyStorage2) * Number(item.unitPrice ?? 0), 0) }; }
  recentTransactions() { return this.transactions.find({ relations: ['item', 'fromLocation', 'toLocation'], order: { transactionDate: 'DESC' }, take: 10 }); }
}
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Item } from '../items/entities/item.entity';
import { Location } from '../locations/entities/location.entity';
import { Transaction } from './entities/transaction.entity';
import { AdjustmentType, TransactionType } from '../common/enums/transaction-type.enum';
import { InventoryService, InventoryChange } from './inventory.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly dataSource: DataSource, private readonly inventory: InventoryService, @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>) {}

  createTransfer(dto: CreateTransferDto, actorId?: number) { return this.execute({ itemCode: dto.itemCode, type: TransactionType.Transfer, fromLocationId: dto.fromLocationId, toLocationId: dto.toLocationId, qty: dto.qty, referenceNo: dto.referenceNo, notes: dto.notes, actorId }); }
  createSale(dto: CreateSaleDto, actorId?: number) { return this.execute({ itemCode: dto.itemCode, type: TransactionType.Sale, fromLocationId: dto.fromLocationId, qty: dto.qty, customerName: dto.customerName, referenceNo: dto.referenceNo, notes: dto.notes, actorId }); }
  createReturn(dto: CreateReturnDto, actorId?: number) { return this.execute({ itemCode: dto.itemCode, type: TransactionType.Return, toLocationId: dto.toLocationId, qty: dto.qty, customerName: dto.customerName, referenceNo: dto.referenceNo, notes: dto.notes, actorId }); }
  createAdjustment(dto: CreateAdjustmentDto, actorId?: number) { return this.execute({ itemCode: dto.itemCode, type: TransactionType.Adjustment, fromLocationId: dto.adjustmentType === AdjustmentType.Decrease ? dto.locationId : undefined, toLocationId: dto.adjustmentType === AdjustmentType.Increase ? dto.locationId : undefined, qty: dto.qty, adjustmentType: dto.adjustmentType, adjustmentReason: dto.adjustmentReason, notes: dto.notes, actorId }); }

  private async execute(input: { itemCode: string; type: TransactionType; fromLocationId?: number; toLocationId?: number; qty: number; adjustmentType?: AdjustmentType; adjustmentReason?: string; customerName?: string; referenceNo?: string; notes?: string; actorId?: number }): Promise<Transaction> {
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(Item, { where: { code: input.itemCode.toUpperCase(), isActive: true }, lock: { mode: 'pessimistic_write' } });
      if (!item) throw new NotFoundException('Item not found');
      const fromLocation = input.fromLocationId ? await this.location(manager, input.fromLocationId) : null;
      const toLocation = input.toLocationId ? await this.location(manager, input.toLocationId) : null;
      const change: InventoryChange = { item, type: input.type, fromLocation, toLocation, qty: input.qty, adjustmentType: input.adjustmentType, adjustmentReason: input.adjustmentReason };
      const snapshots = await this.inventory.applyTransaction(manager, change);
      await manager.save(item);
      return manager.save(Transaction, manager.create(Transaction, { item, transactionType: input.type, fromLocation, toLocation, qty: input.qty, adjustmentType: input.adjustmentType ?? null, adjustmentReason: input.adjustmentReason ?? null, customerName: input.customerName ?? null, referenceNo: input.referenceNo ?? null, notes: input.notes ?? null, qtyShowroomBefore: snapshots.before.showroom, qtyStorage1Before: snapshots.before.storage1, qtyStorage2Before: snapshots.before.storage2, qtySoldBefore: snapshots.before.sold, qtyShowroomAfter: snapshots.after.showroom, qtyStorage1After: snapshots.after.storage1, qtyStorage2After: snapshots.after.storage2, qtySoldAfter: snapshots.after.sold, createdBy: input.actorId ? { id: input.actorId } : null }));
    });
  }
  private async location(manager: EntityManager, id: number): Promise<Location> { const location = await manager.findOne(Location, { where: { id } }); if (!location) throw new NotFoundException(`Location with ID ${id} not found`); return location; }
  findAll() { return this.transactions.find({ relations: ['item', 'fromLocation', 'toLocation'], order: { transactionDate: 'DESC' } }); }
  async findOne(id: number) { const transaction = await this.transactions.findOne({ where: { id }, relations: ['item', 'fromLocation', 'toLocation'] }); if (!transaction) throw new NotFoundException('Transaction not found'); return transaction; }
}
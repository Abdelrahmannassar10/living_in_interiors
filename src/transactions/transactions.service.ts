import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Item } from '../items/entities/item.entity';
import { Location } from '../locations/entities/location.entity';
import { Transaction } from './entities/transaction.entity';
import {
  AdjustmentReason,
  AdjustmentType,
  TransactionType,
} from '../common/enums/transaction-type.enum';
import { InventoryService, InventoryChange } from './inventory.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { AppGateway } from '../gateway/app.gateway';
import { StockAlertsService } from '../stock-alerts/stock-alerts.service';
import { AuditLog } from '../audit-log/entities/audit-log.entity';
import { TransactionSearchDto } from './dto/search-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly inventory: InventoryService,
    private readonly gateway: AppGateway,
    private readonly stockAlerts: StockAlertsService,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
  ) {}

  createTransfer(dto: CreateTransferDto, actorId?: number) {
    return this.execute({
      itemCode: dto.itemCode,
      type: TransactionType.Transfer,
      fromLocationId: dto.fromLocationId,
      toLocationId: dto.toLocationId,
      qty: dto.qty,
      referenceNo: dto.referenceNo,
      notes: dto.notes,
      actorId,
    });
  }
  createSale(dto: CreateSaleDto, actorId?: number) {
    return this.execute({
      itemCode: dto.itemCode,
      type: TransactionType.Sale,
      fromLocationId: dto.fromLocationId,
      qty: dto.qty,
      customerName: dto.customerName,
      referenceNo: dto.referenceNo,
      notes: dto.notes,
      actorId,
    });
  }
  createReturn(dto: CreateReturnDto, actorId?: number) {
    return this.execute({
      itemCode: dto.itemCode,
      type: TransactionType.Return,
      toLocationId: dto.toLocationId,
      qty: dto.qty,
      customerName: dto.customerName,
      referenceNo: dto.referenceNo,
      notes: dto.notes,
      actorId,
    });
  }
  createAdjustment(dto: CreateAdjustmentDto, actorId?: number) {
    return this.execute({
      itemCode: dto.itemCode,
      type: TransactionType.Adjustment,
      fromLocationId:
        dto.adjustmentType === AdjustmentType.Decrease
          ? dto.locationId
          : undefined,
      toLocationId:
        dto.adjustmentType === AdjustmentType.Increase
          ? dto.locationId
          : undefined,
      qty: dto.qty,
      adjustmentType: dto.adjustmentType,
      adjustmentReason: dto.adjustmentReason,
      notes: dto.notes,
      actorId,
    });
  }

  private async execute(input: {
    itemCode: string;
    type: TransactionType;
    fromLocationId?: number;
    toLocationId?: number;
    qty: number;
    adjustmentType?: AdjustmentType;
    adjustmentReason?: AdjustmentReason;
    customerName?: string;
    referenceNo?: string;
    notes?: string;
    actorId?: number;
  }): Promise<Transaction> {
    const transaction = await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(Item, {
        where: { code: input.itemCode.toUpperCase(), isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException('Item not found');

      const fromLocation = input.fromLocationId
        ? await this.location(manager, input.fromLocationId)
        : null;
      const toLocation = input.toLocationId
        ? await this.location(manager, input.toLocationId)
        : null;
      if (input.fromLocationId && !fromLocation?.isPhysical)
        throw new BadRequestException(
          `${fromLocation?.name ?? 'Source location'} is not a physical location`,
        );
      if (input.toLocationId && !toLocation?.isPhysical)
        throw new BadRequestException(
          `${toLocation?.name ?? 'Destination location'} is not a physical location`,
        );

      const change: InventoryChange = {
        item,
        type: input.type,
        fromLocation,
        toLocation,
        qty: input.qty,
        adjustmentType: input.adjustmentType,
        adjustmentReason: input.adjustmentReason,
      };
      const snapshots = await this.inventory.applyTransaction(manager, change);
      await manager.save(item);

      const record = manager.create(Transaction, {
        item,
        transactionType: input.type,
        fromLocation,
        toLocation,
        qty: input.qty,
        adjustmentType: input.adjustmentType ?? null,
        adjustmentReason: input.adjustmentReason ?? null,
        customerName: input.customerName ?? null,
        referenceNo: input.referenceNo ?? null,
        notes: input.notes ?? null,
        stockBefore: snapshots.before,
        stockAfter: snapshots.after,
        createdBy: input.actorId ? { id: input.actorId } : null,
      });
      const saved = await manager.save(record);

      await manager.save(
        manager.create(AuditLog, {
          userId: input.actorId ?? null,
          action: 'create',
          entity: 'transaction',
          entityId: String(saved.id),
          newValues: {
            type: input.type,
            itemCode: item.code,
            qty: input.qty,
            fromLocationId: fromLocation?.id ?? null,
            toLocationId: toLocation?.id ?? null,
            adjustmentReason: input.adjustmentReason ?? null,
          },
        }),
      );

      return saved;
    });

    // Post-commit side effects (never inside the DB transaction).
    this.gateway.emitTransactionCreated(
      transaction.id,
      transaction.transactionType,
      transaction.item.code,
      transaction.qty,
    );
    this.gateway.emitStockUpdated(
      transaction.item.code,
      transaction.stockAfter,
    );
    await this.stockAlerts.evaluateAfterTransaction(transaction);

    return transaction;
  }

  private async location(
    manager: DataSource['manager'],
    id: number,
  ): Promise<Location | null> {
    return manager.findOne(Location, { where: { id } });
  }

  async findAll(
    query: TransactionSearchDto,
  ): Promise<PaginatedResult<Transaction>> {
    const builder = this.transactions
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.item', 'item')
      .leftJoinAndSelect('transaction.fromLocation', 'fromLocation')
      .leftJoinAndSelect('transaction.toLocation', 'toLocation')
      .orderBy('transaction.transactionDate', 'DESC');
    if (query.type)
      builder.andWhere('transaction.transactionType = :type', {
        type: query.type,
      });
    if (query.itemCode)
      builder.andWhere('item.code = :code', {
        code: query.itemCode.toUpperCase(),
      });
    builder.skip((query.page - 1) * query.limit).take(query.limit);
    const [data, total] = await builder.getManyAndCount();
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: number) {
    const transaction = await this.transactions.findOne({
      where: { id },
      relations: ['item', 'fromLocation', 'toLocation'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }
}

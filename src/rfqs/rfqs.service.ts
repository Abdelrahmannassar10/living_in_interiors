import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { NumberingService } from '../common/services/numbering.service';
import { PaginatedResult, PaginationDto } from '../common/dto/pagination.dto';
import { RfqStatus } from '../common/enums/rfq-status.enum';
import { ItemsService } from '../items/items.service';
import { RfqLine } from './entities/rfq-line.entity';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { UpdateRfqDto } from './dto/update-rfq.dto';
import { AddRfqLineDto } from './dto/add-rfq-line.dto';
import { UpdateRfqLineDto } from './dto/update-rfq-line.dto';
import { Rfq } from './entities/rfq.entity';

const TRANSITIONS: Record<RfqStatus, RfqStatus[]> = {
  [RfqStatus.Draft]: [RfqStatus.Sent, RfqStatus.Cancelled],
  [RfqStatus.Sent]: [RfqStatus.Received, RfqStatus.Cancelled],
  [RfqStatus.Received]: [RfqStatus.Awarded, RfqStatus.Cancelled],
  [RfqStatus.Awarded]: [],
  [RfqStatus.Cancelled]: [],
};

@Injectable()
export class RfqsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly numbering: NumberingService,
    @InjectRepository(Rfq)
    private readonly rfqs: Repository<Rfq>,
    @InjectRepository(RfqLine)
    private readonly lines: Repository<RfqLine>,
    private readonly items: ItemsService,
  ) {}

  private async allocateRfqNo(manager: DataSource['manager']): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    return this.numbering.next(
      manager,
      `rfq:${year}`,
      (value) => `RFQ#${String(value).padStart(4, '0')}-${year}`,
      async () => {
        const result: Array<{ max_seq: string | null }> = await manager.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(rfq_no FROM 'RFQ#([0-9]+)-') AS INTEGER)), 0) AS max_seq FROM rfqs WHERE rfq_no LIKE $1`,
          [`RFQ#%-${year}`],
        );
        return Number(result[0]?.max_seq ?? 0);
      },
    );
  }

  async findAll(query: PaginationDto): Promise<PaginatedResult<Rfq>> {
    const builder = this.rfqs
      .createQueryBuilder('rfq')
      .leftJoinAndSelect('rfq.supplier', 'supplier')
      .leftJoinAndSelect('rfq.client', 'client')
      .leftJoinAndSelect('rfq.createdBy', 'createdBy')
      .orderBy('rfq.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
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
    const rfq = await this.rfqs.findOne({
      where: { id },
      relations: ['supplier', 'client', 'lines', 'lines.item', 'createdBy'],
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    rfq.lines = rfq.lines
      .filter((line) => !line.isDeleted)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return rfq;
  }

  async create(dto: CreateRfqDto, actorId?: number) {
    return this.dataSource.transaction(async (manager) => {
      const supplier = dto.supplierId
        ? await manager.findOne(Supplier, {
            where: { id: dto.supplierId, isActive: true },
          })
        : null;
      if (dto.supplierId && !supplier)
        throw new NotFoundException('Supplier not found');

      const client = dto.clientId
        ? await manager.findOne(Client, {
            where: { id: dto.clientId, isActive: true },
          })
        : null;
      if (dto.clientId && !client)
        throw new NotFoundException('Client not found');

      const rfq = manager.create(Rfq, {
        ...dto,
        rfqNo: await this.allocateRfqNo(manager),
        supplier,
        client,
        clientName: client?.name ?? dto.clientName ?? null,
        status: RfqStatus.Draft,
        currency: dto.currency ?? 'USD',
        createdBy: actorId ? { id: actorId } : null,
      });
      return manager.save(rfq);
    });
  }

  async update(id: number, dto: UpdateRfqDto) {
    const rfq = await this.findOne(id);
    if (rfq.status !== RfqStatus.Draft)
      throw new BadRequestException(
        'RFQ can only be edited while in Draft status',
      );

    return this.dataSource.transaction(async (manager) => {
      if (dto.supplierId !== undefined) {
        const supplier = dto.supplierId
          ? await manager.findOne(Supplier, {
              where: { id: dto.supplierId, isActive: true },
            })
          : null;
        if (dto.supplierId && !supplier)
          throw new NotFoundException('Supplier not found');
        rfq.supplier = supplier;
      }

      if (dto.clientId !== undefined) {
        const client = dto.clientId
          ? await manager.findOne(Client, {
              where: { id: dto.clientId, isActive: true },
            })
          : null;
        if (dto.clientId && !client)
          throw new NotFoundException('Client not found');
        rfq.client = client;
        rfq.clientName = client?.name ?? dto.clientName ?? null;
      }

      if (dto.clientName !== undefined) rfq.clientName = dto.clientName;
      if (dto.contactPerson !== undefined)
        rfq.contactPerson = dto.contactPerson;
      if (dto.phone !== undefined) rfq.phone = dto.phone;
      if (dto.email !== undefined) rfq.email = dto.email;
      if (dto.validUntil !== undefined) rfq.validUntil = dto.validUntil;
      if (dto.notes !== undefined) rfq.notes = dto.notes;
      if (dto.internalNotes !== undefined)
        rfq.internalNotes = dto.internalNotes;
      if (dto.currency !== undefined) rfq.currency = dto.currency;

      return manager.save(rfq);
    });
  }

  async updateStatus(id: number, status: RfqStatus) {
    const rfq = await this.findOne(id);
    const allowed = TRANSITIONS[rfq.status] ?? [];
    if (!allowed.includes(status))
      throw new BadRequestException(
        `Cannot transition from ${rfq.status} to ${status}`,
      );
    rfq.status = status;
    return this.rfqs.save(rfq);
  }

  async addLine(dto: AddRfqLineDto) {
    const rfq = await this.loadEditableRfq(dto.rfqId);
    const item = await this.items.findOne(dto.itemCode);

    const max = await this.lines
      .createQueryBuilder('line')
      .select('COALESCE(MAX(line.sort_order), -1)', 'max')
      .where('line.rfq_id = :id', { id: dto.rfqId })
      .getRawOne<{ max: string }>();

    return this.dataSource.transaction(async (manager) => {
      return manager.save(
        manager.create(RfqLine, {
          rfq,
          item,
          sortOrder: Number(max?.max ?? -1) + 1,
          codeSnapshot: item.code,
          descriptionSnapshot: item.description,
          qty: dto.qty,
          description: dto.description ?? null,
          isDeleted: false,
        }),
      );
    });
  }

  async updateLine(id: number, dto: UpdateRfqLineDto) {
    const line = await this.lines.findOne({
      where: { id, isDeleted: false },
      relations: ['rfq'],
    });
    if (!line) throw new NotFoundException('RFQ line not found');
    await this.assertDraft(line.rfq.id);

    if (dto.qty !== undefined) line.qty = dto.qty;
    if (dto.description !== undefined) line.description = dto.description;
    if (dto.unitPrice !== undefined) line.unitPrice = dto.unitPrice.toFixed(2);
    if (dto.leadTimeDays !== undefined) line.leadTimeDays = dto.leadTimeDays;

    return this.lines.save(line);
  }

  async removeLine(id: number) {
    const line = await this.lines.findOne({
      where: { id },
      relations: ['rfq'],
    });
    if (!line) throw new NotFoundException('RFQ line not found');
    await this.assertDraft(line.rfq.id);
    line.isDeleted = true;
    return this.lines.save(line);
  }

  private async loadEditableRfq(rfqId: number): Promise<Rfq> {
    const rfq = await this.rfqs.findOneBy({ id: rfqId });
    if (!rfq) throw new NotFoundException('RFQ not found');
    await this.assertDraft(rfqId);
    return rfq;
  }

  private async assertDraft(rfqId: number): Promise<void> {
    const rfq = await this.rfqs.findOneBy({ id: rfqId });
    if (!rfq) throw new NotFoundException('RFQ not found');
    if (rfq.status !== RfqStatus.Draft)
      throw new BadRequestException(
        'Lines can only be changed while the RFQ is a Draft',
      );
  }
}

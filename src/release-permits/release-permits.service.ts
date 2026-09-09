import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { NumberingService } from '../common/services/numbering.service';
import { PaginatedResult, PaginationDto } from '../common/dto/pagination.dto';
import { ReleasePermitStatus } from '../common/enums/release-permit-status.enum';
import { CreateReleasePermitDto } from './dto/create-release-permit.dto';
import { ReleasePermitLine } from './entities/release-permit-line.entity';
import { ReleasePermit } from './entities/release-permit.entity';

const TRANSITIONS: Record<ReleasePermitStatus, ReleasePermitStatus[]> = {
  [ReleasePermitStatus.Draft]: [
    ReleasePermitStatus.Approved,
    ReleasePermitStatus.Cancelled,
  ],
  [ReleasePermitStatus.Approved]: [
    ReleasePermitStatus.Released,
    ReleasePermitStatus.Cancelled,
  ],
  [ReleasePermitStatus.Released]: [],
  [ReleasePermitStatus.Cancelled]: [],
};

@Injectable()
export class ReleasePermitsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly numbering: NumberingService,
    @InjectRepository(ReleasePermit)
    private readonly permits: Repository<ReleasePermit>,
    @InjectRepository(ReleasePermitLine)
    private readonly lines: Repository<ReleasePermitLine>,
  ) {}

  private async allocatePermitNo(
    manager: DataSource['manager'],
  ): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    return this.numbering.next(
      manager,
      `release-permit:${year}`,
      (value) => `RP-${year}-${String(value).padStart(4, '0')}`,
      async () => {
        const result: Array<{ max_seq: string | null }> = await manager.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(permit_no FROM 'RP-[0-9]+-([0-9]+)') AS INTEGER)), 0) AS max_seq FROM release_permits WHERE permit_no LIKE $1`,
          [`RP-${year}-%`],
        );
        return Number(result[0]?.max_seq ?? 0);
      },
    );
  }

  async findAll(query: PaginationDto): Promise<PaginatedResult<ReleasePermit>> {
    const builder = this.permits
      .createQueryBuilder('permit')
      .leftJoinAndSelect('permit.salesOrder', 'salesOrder')
      .leftJoinAndSelect('permit.createdBy', 'createdBy')
      .leftJoinAndSelect('permit.approvedBy', 'approvedBy')
      .leftJoinAndSelect('permit.releasedBy', 'releasedBy')
      .orderBy('permit.createdAt', 'DESC')
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
    const permit = await this.permits.findOne({
      where: { id },
      relations: [
        'salesOrder',
        'lines',
        'lines.item',
        'lines.salesOrderLine',
        'createdBy',
        'approvedBy',
        'releasedBy',
      ],
    });
    if (!permit) throw new NotFoundException('Release permit not found');
    return permit;
  }

  async create(dto: CreateReleasePermitDto, actorId?: number) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(SalesOrder, {
        where: { id: dto.salesOrderId },
        relations: ['lines', 'lines.item'],
      });
      if (!order) throw new NotFoundException('Sales order not found');

      const permit = manager.create(ReleasePermit, {
        permitNo: await this.allocatePermitNo(manager),
        salesOrder: { id: dto.salesOrderId },
        status: ReleasePermitStatus.Draft,
        notes: dto.notes ?? null,
        internalNotes: dto.internalNotes ?? null,
        createdBy: actorId ? { id: actorId } : null,
      });
      const saved = await manager.save(permit);

      for (const lineDto of dto.lines) {
        const orderLine = order.lines.find(
          (l) => l.id === lineDto.salesOrderLineId,
        );
        if (!orderLine)
          throw new NotFoundException(
            `Sales order line ${lineDto.salesOrderLineId} not found`,
          );

        const remaining = orderLine.qty - orderLine.qtyDelivered;
        if (lineDto.qty > remaining)
          throw new BadRequestException(
            `Cannot release ${lineDto.qty} for line ${orderLine.id}: only ${remaining} remaining undelivered`,
          );

        await manager.save(
          manager.create(ReleasePermitLine, {
            releasePermit: saved,
            salesOrderLine: { id: orderLine.id },
            item: orderLine.item ?? null,
            codeSnapshot: orderLine.codeSnapshot,
            descriptionSnapshot: orderLine.descriptionSnapshot,
            qty: lineDto.qty,
          }),
        );
      }

      return this.findOne(saved.id);
    });
  }

  async updateStatus(
    id: number,
    status: ReleasePermitStatus,
    actorId?: number,
  ) {
    const permit = await this.findOne(id);
    const allowed = TRANSITIONS[permit.status] ?? [];
    if (!allowed.includes(status))
      throw new BadRequestException(
        `Cannot transition from ${permit.status} to ${status}`,
      );

    return this.dataSource.transaction(async (manager) => {
      if (status === ReleasePermitStatus.Approved) {
        permit.approvedBy = actorId
          ? ({ id: actorId } as unknown as ReleasePermit['approvedBy'])
          : null;
        permit.approvedAt = new Date();
      }
      if (status === ReleasePermitStatus.Released) {
        permit.releasedBy = actorId
          ? ({ id: actorId } as unknown as ReleasePermit['releasedBy'])
          : null;
        permit.releasedAt = new Date();
      }
      permit.status = status;
      return manager.save(permit);
    });
  }

  async addLine(permitId: number, salesOrderLineId: number, qty: number) {
    const permit = await this.findOne(permitId);
    if (permit.status !== ReleasePermitStatus.Draft)
      throw new BadRequestException(
        'Lines can only be added while the permit is a Draft',
      );

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(SalesOrder, {
        where: { id: permit.salesOrder.id },
        relations: ['lines', 'lines.item'],
      });
      if (!order) throw new NotFoundException('Sales order not found');

      const orderLine = order.lines.find((l) => l.id === salesOrderLineId);
      if (!orderLine) throw new NotFoundException('Sales order line not found');

      const existingReleased = await manager
        .createQueryBuilder(ReleasePermitLine, 'rpl')
        .innerJoin('rpl.releasePermit', 'rp')
        .where('rp.sales_order_id = :orderId', { orderId: order.id })
        .andWhere('rp.id != :permitId', { permitId })
        .andWhere('rp.status != :cancelled', {
          cancelled: ReleasePermitStatus.Cancelled,
        })
        .andWhere('rpl.sales_order_line_id = :lineId', {
          lineId: salesOrderLineId,
        })
        .select('COALESCE(SUM(rpl.qty), 0)', 'total')
        .getRawOne<{ total: string }>();

      const alreadyReleased = Number(existingReleased?.total ?? 0);
      const remaining =
        orderLine.qty - orderLine.qtyDelivered - alreadyReleased;
      if (qty > remaining)
        throw new BadRequestException(
          `Cannot release ${qty}: only ${remaining} remaining`,
        );

      return manager.save(
        manager.create(ReleasePermitLine, {
          releasePermit: { id: permitId },
          salesOrderLine: { id: salesOrderLineId },
          item: orderLine.item ?? null,
          codeSnapshot: orderLine.codeSnapshot,
          descriptionSnapshot: orderLine.descriptionSnapshot,
          qty,
        }),
      );
    });
  }

  async removeLine(lineId: number) {
    const line = await this.lines.findOne({
      where: { id: lineId },
      relations: ['releasePermit'],
    });
    if (!line) throw new NotFoundException('Release permit line not found');
    if (line.releasePermit.status !== ReleasePermitStatus.Draft)
      throw new BadRequestException(
        'Lines can only be removed while the permit is a Draft',
      );
    return this.lines.remove(line);
  }
}

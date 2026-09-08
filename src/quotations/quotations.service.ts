import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { NumberingService } from '../common/services/numbering.service';
import { PaginatedResult, PaginationDto } from '../common/dto/pagination.dto';
import { QuotationStatus } from '../common/enums/quotation-status.enum';
import { QuotationDetail } from '../quotation-details/entities/quotation-detail.entity';
import { QuotationRevision } from './entities/quotation-revision.entity';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { Quotation } from './entities/quotation.entity';
import { computeQuotationTotals } from './totals';

const TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  [QuotationStatus.Draft]: [QuotationStatus.Sent, QuotationStatus.Cancelled],
  [QuotationStatus.Sent]: [
    QuotationStatus.Approved,
    QuotationStatus.Rejected,
    QuotationStatus.Draft,
  ],
  [QuotationStatus.Rejected]: [QuotationStatus.Draft],
  [QuotationStatus.Approved]: [
    QuotationStatus.Cancelled,
    QuotationStatus.Converted,
  ],
  [QuotationStatus.Cancelled]: [],
  [QuotationStatus.Expired]: [],
  [QuotationStatus.Converted]: [],
};

@Injectable()
export class QuotationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly numbering: NumberingService,
    @InjectRepository(Quotation)
    private readonly quotations: Repository<Quotation>,
    @InjectRepository(QuotationDetail)
    private readonly details: Repository<QuotationDetail>,
  ) {}

  /** Race-free: the number is allocated from number_sequences inside the creation transaction. */
  private async allocateQuoteNo(
    manager: DataSource['manager'],
  ): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    return this.numbering.next(
      manager,
      `quotation:${year}`,
      (value) => `Q.AR#${value}-${year}`,
      async () => {
        const result: Array<{ max_seq: string | null }> = await manager.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(quote_no FROM 'Q\\.AR#([0-9]+)-') AS INTEGER)), 0) AS max_seq FROM quotations WHERE quote_no LIKE $1`,
          [`Q.AR#%-${year}`],
        );
        return Number(result[0]?.max_seq ?? 0);
      },
    );
  }

  async findAll(query: PaginationDto): Promise<PaginatedResult<Quotation>> {
    const builder = this.quotations
      .createQueryBuilder('quotation')
      .leftJoinAndSelect('quotation.client', 'client')
      .leftJoinAndSelect('quotation.createdBy', 'createdBy')
      .orderBy('quotation.createdAt', 'DESC')
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
    const quotation = await this.quotations.findOne({
      where: { id },
      relations: ['client', 'details', 'details.item'],
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    quotation.details = quotation.details
      .filter((detail) => !detail.isDeleted)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return quotation;
  }

  async create(dto: CreateQuotationDto, actorId?: number) {
    return this.dataSource.transaction(async (manager) => {
      const client = dto.clientId
        ? await manager.findOne(Client, {
            where: { id: dto.clientId, isActive: true },
          })
        : null;
      if (dto.clientId && !client)
        throw new NotFoundException('Client not found');
      const quotation = manager.create(Quotation, {
        ...dto,
        discountGlobal: String(dto.discountGlobal ?? 0),
        vatPercent: String(dto.vatPercent ?? 0),
        currency: dto.currency ?? 'USD',
        quoteNo: await this.allocateQuoteNo(manager),
        client,
        clientName: client?.name ?? dto.clientName ?? null,
        status: QuotationStatus.Draft,
        revision: 0,
        createdBy: actorId ? { id: actorId } : null,
      });
      return manager.save(quotation);
    });
  }

  async updateStatus(id: number, status: QuotationStatus) {
    const quotation = await this.findOne(id);
    const allowed = TRANSITIONS[quotation.status] ?? [];
    if (!allowed.includes(status))
      throw new BadRequestException(
        `Cannot transition from ${quotation.status} to ${status}`,
      );
    if (status === QuotationStatus.Sent && !quotation.email)
      throw new BadRequestException(
        'Quotation email is required before sending',
      );
    quotation.status = status;
    return this.quotations.save(quotation);
  }

  /**
   * Writes a full snapshot of the quotation into quotation_revisions and bumps
   * the revision counter. Used for changes made after a quotation left Draft.
   */
  async recordRevision(
    manager: DataSource['manager'],
    quotation: Quotation,
    changedBy: number | null,
    changeSummary: string,
  ): Promise<void> {
    const details = await manager.find(QuotationDetail, {
      where: { quotation: { id: quotation.id }, isDeleted: false },
      order: { sortOrder: 'ASC' },
    });
    const snapshot = {
      quoteNo: quotation.quoteNo,
      clientName: quotation.clientName,
      status: quotation.status,
      discountGlobal: quotation.discountGlobal,
      vatPercent: quotation.vatPercent,
      currency: quotation.currency,
      totals: computeQuotationTotals({
        lines: details,
        discountGlobalPercent: quotation.discountGlobal,
        vatPercent: quotation.vatPercent,
        currency: quotation.currency,
      }),
      lines: details.map((detail) => ({
        code: detail.codeSnapshot,
        qty: detail.qty,
        unitPrice: detail.unitPrice,
        discountPercent: detail.discountPercent,
        totalPriceAfterDiscount: detail.totalPriceAfterDiscount,
      })),
    };
    quotation.revision += 1;
    await manager.save(quotation);
    await manager.save(
      manager.create(QuotationRevision, {
        quotation,
        revisionNumber: quotation.revision,
        snapshot,
        changedBy: changedBy ? { id: changedBy } : null,
        changeSummary,
      }),
    );
  }

  computeTotals(id: number) {
    return this.findOne(id).then((quotation) =>
      computeQuotationTotals({
        lines: quotation.details,
        discountGlobalPercent: quotation.discountGlobal,
        vatPercent: quotation.vatPercent,
        currency: quotation.currency,
      }),
    );
  }
}

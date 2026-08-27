import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { QuotationStatus } from '../common/enums/quotation-status.enum';
import { QuotationDetail } from '../quotation-details/entities/quotation-detail.entity';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { Quotation } from './entities/quotation.entity';

@Injectable()
export class QuotationsService {
  constructor(private readonly dataSource: DataSource, @InjectRepository(Quotation) private readonly quotations: Repository<Quotation>, @InjectRepository(QuotationDetail) private readonly details: Repository<QuotationDetail>) {}

  async generateQuoteNo(): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const result = await this.dataSource.query(`SELECT COALESCE(MAX(CAST(SUBSTRING(quote_no FROM 'Q\\.AR#([0-9]+)-') AS INTEGER)), 999) AS max_seq FROM quotations WHERE quote_no LIKE $1`, [`Q.AR#%-${year}`]);
    return `Q.AR#${Number(result[0].max_seq) + 1}-${year}`;
  }
  async findAll() { return this.quotations.find({ relations: ['client', 'createdBy'], order: { createdAt: 'DESC' } }); }
  async findOne(id: number) { const quotation = await this.quotations.findOne({ where: { id }, relations: ['client', 'details', 'details.item'] }); if (!quotation) throw new NotFoundException('Quotation not found'); quotation.details = quotation.details.filter((detail) => !detail.isDeleted).sort((a, b) => a.sortOrder - b.sortOrder); return quotation; }
  async create(dto: CreateQuotationDto) { const client = dto.clientId ? await this.dataSource.getRepository(Client).findOneBy({ id: dto.clientId }) : null; if (dto.clientId && !client) throw new NotFoundException('Client not found'); return this.quotations.save(this.quotations.create({ ...dto, quoteNo: await this.generateQuoteNo(), client, clientName: client?.name ?? dto.clientName ?? null, status: QuotationStatus.Draft, revision: 0, discountGlobal: dto.discountGlobal ?? '0', vatPercent: dto.vatPercent ?? '0', currency: dto.currency ?? 'USD' })); }
  async updateStatus(id: number, status: QuotationStatus) { const quotation = await this.findOne(id); const valid = (quotation.status === QuotationStatus.Draft && [QuotationStatus.Sent, QuotationStatus.Cancelled].includes(status)) || (quotation.status === QuotationStatus.Sent && [QuotationStatus.Approved, QuotationStatus.Rejected, QuotationStatus.Draft].includes(status)) || (quotation.status === QuotationStatus.Rejected && status === QuotationStatus.Draft) || (quotation.status === QuotationStatus.Approved && status === QuotationStatus.Cancelled); if (!valid) throw new BadRequestException(`Cannot transition from ${quotation.status} to ${status}`); quotation.status = status; return this.quotations.save(quotation); }
  async computeTotals(id: number) { const quotation = await this.findOne(id); const subtotal = quotation.details.reduce((sum, detail) => sum + Number(detail.totalPriceAfterDiscount), 0); const globalDiscountAmount = subtotal * Number(quotation.discountGlobal) / 100; const vatAmount = (subtotal - globalDiscountAmount) * Number(quotation.vatPercent) / 100; return { subtotal, globalDiscountAmount, vatAmount, grandTotal: subtotal - globalDiscountAmount + vatAmount, currency: quotation.currency, activeLineCount: quotation.details.length }; }
}
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ItemsService } from '../items/items.service';
import { QuotationStatus } from '../common/enums/quotation-status.enum';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateQuotationDetailDto } from './dto/update-detail.dto';
import { QuotationDetail } from './entities/quotation-detail.entity';
import { Quotation } from '../quotations/entities/quotation.entity';
import { QuotationsService } from '../quotations/quotations.service';

@Injectable()
export class QuotationDetailsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(QuotationDetail) private readonly details: Repository<QuotationDetail>,
    @InjectRepository(Quotation) private readonly quotations: Repository<Quotation>,
    private readonly items: ItemsService,
    private readonly quotationsService: QuotationsService,
  ) {}

  async addItem(dto: AddItemDto, actorId?: number) {
    const quotation = await this.loadEditableQuotation(dto.quotationId);
    const item = await this.items.findOne(dto.itemCode);
    const unitPrice = dto.unitPrice ?? Number(item.unitPrice ?? 0);
    const discountPercent = dto.discountPercent ?? 0;
    const totalPrice = dto.qty * unitPrice;
    const discountAmount = (totalPrice * discountPercent) / 100;
    const max = await this.details.createQueryBuilder('detail').select('COALESCE(MAX(detail.sort_order), -1)', 'max').where('detail.quotation_id = :id', { id: dto.quotationId }).getRawOne<{ max: string }>();
    const photoUrl = await this.items.getPrimaryPhotoUrl(item.code);

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(manager.create(QuotationDetail, {
        quotation, item, sortOrder: Number(max?.max ?? -1) + 1,
        brandSnapshot: item.brand?.name ?? null, codeSnapshot: item.code, descriptionSnapshot: item.description,
        dimensionSnapshot: item.dimension, finishFabricSnapshot: item.finishFabric, photoUrlSnapshot: photoUrl,
        qty: dto.qty, unitPrice: unitPrice.toFixed(2), currency: item.currency,
        discountPercent: discountPercent.toFixed(2), discountAmount: discountAmount.toFixed(2),
        totalPrice: totalPrice.toFixed(2), totalPriceAfterDiscount: (totalPrice - discountAmount).toFixed(2),
        notes: dto.notes ?? null, isDeleted: false,
      }));
      await this.maybeRecordRevision(manager, quotation.id, actorId, `Added line ${item.code}`);
      return saved;
    });
  }

  async updateItem(id: number, dto: UpdateQuotationDetailDto, actorId?: number) {
    const detail = await this.details.findOne({ where: { id, isDeleted: false }, relations: ['quotation'] });
    if (!detail) throw new NotFoundException('Quotation detail not found');
    await this.assertDraft(detail.quotation.id);
    const qty = dto.qty ?? detail.qty;
    const unitPrice = dto.unitPrice ?? Number(detail.unitPrice);
    const discountPercent = dto.discountPercent ?? Number(detail.discountPercent);
    const totalPrice = qty * unitPrice;
    const discountAmount = (totalPrice * discountPercent) / 100;

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(QuotationDetail, {
        ...detail, qty, unitPrice: unitPrice.toFixed(2),
        discountPercent: discountPercent.toFixed(2), discountAmount: discountAmount.toFixed(2),
        totalPrice: totalPrice.toFixed(2), totalPriceAfterDiscount: (totalPrice - discountAmount).toFixed(2),
        notes: dto.notes ?? detail.notes,
      });
      await this.maybeRecordRevision(manager, detail.quotation.id, actorId, `Updated line ${detail.codeSnapshot ?? detail.id}`);
      return saved;
    });
  }

  async softDelete(id: number, actorId?: number) {
    const detail = await this.details.findOne({ where: { id }, relations: ['quotation'] });
    if (!detail) throw new NotFoundException('Quotation detail not found');
    await this.assertDraft(detail.quotation.id);
    detail.isDeleted = true;
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(detail);
      await this.maybeRecordRevision(manager, detail.quotation.id, actorId, `Removed line ${detail.codeSnapshot ?? detail.id}`);
      return saved;
    });
  }

  private async loadEditableQuotation(quotationId: number): Promise<Quotation> {
    const quotation = await this.quotations.findOneBy({ id: quotationId });
    if (!quotation) throw new NotFoundException('Quotation not found');
    await this.assertDraft(quotationId);
    return quotation;
  }

  private async assertDraft(quotationId: number): Promise<void> {
    const quotation = await this.quotations.findOneBy({ id: quotationId });
    if (!quotation) throw new NotFoundException('Quotation not found');
    if (quotation.status !== QuotationStatus.Draft) throw new BadRequestException('Lines can only be changed while the quotation is a Draft');
  }

  /** Quotations that already left Draft get a revision snapshot on every line change. */
  private async maybeRecordRevision(manager: DataSource['manager'], quotationId: number, actorId: number | undefined, summary: string): Promise<void> {
    const quotation = await manager.findOne(Quotation, { where: { id: quotationId } });
    if (!quotation || quotation.status === QuotationStatus.Draft) return;
    await this.quotationsService.recordRevision(manager, quotation, actorId ?? null, summary);
  }
}

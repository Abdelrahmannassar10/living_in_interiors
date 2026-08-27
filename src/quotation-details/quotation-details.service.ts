import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemsService } from '../items/items.service';
import { QuotationStatus } from '../common/enums/quotation-status.enum';
import { AddItemDto } from './dto/add-item.dto';
import { QuotationDetail } from './entities/quotation-detail.entity';
import { Quotation } from '../quotations/entities/quotation.entity';

@Injectable()
export class QuotationDetailsService {
  constructor(@InjectRepository(QuotationDetail) private readonly details: Repository<QuotationDetail>, @InjectRepository(Quotation) private readonly quotations: Repository<Quotation>, private readonly items: ItemsService) {}
  async addItem(dto: AddItemDto) { const quotation = await this.quotations.findOneBy({ id: dto.quotationId }); if (!quotation) throw new NotFoundException('Quotation not found'); if (quotation.status !== QuotationStatus.Draft) throw new BadRequestException('Can only add items to Draft quotations'); const item = await this.items.findOne(dto.itemCode); const unitPrice = Number(dto.unitPrice ?? item.unitPrice ?? 0); const discountPercent = Number(dto.discountPercent ?? 0); const totalPrice = dto.qty * unitPrice; const discountAmount = totalPrice * discountPercent / 100; const max = await this.details.createQueryBuilder('detail').select('COALESCE(MAX(detail.sort_order), -1)', 'max').where('detail.quotation_id = :id', { id: dto.quotationId }).getRawOne<{ max: string }>(); return this.details.save(this.details.create({ quotation, item, sortOrder: Number(max?.max ?? -1) + 1, brandSnapshot: item.brand?.name ?? null, codeSnapshot: item.code, descriptionSnapshot: item.description, dimensionSnapshot: item.dimension, finishFabricSnapshot: item.finishFabric, qty: dto.qty, unitPrice: unitPrice.toFixed(2), currency: item.currency, discountPercent: discountPercent.toFixed(2), discountAmount: discountAmount.toFixed(2), totalPrice: totalPrice.toFixed(2), totalPriceAfterDiscount: (totalPrice - discountAmount).toFixed(2), notes: dto.notes ?? null, isDeleted: false })); }
  async softDelete(id: number) { const detail = await this.details.findOne({ where: { id }, relations: ['quotation'] }); if (!detail) throw new NotFoundException('Quotation detail not found'); detail.isDeleted = true; await this.details.save(detail); }
}
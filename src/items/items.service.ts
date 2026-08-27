import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../brands/entities/brand.entity';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { SearchItemDto } from './dto/search-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Item } from './entities/item.entity';

export interface StockSummary { showroom: number; storage1: number; storage2: number; total: number; qtySold: number; }

@Injectable()
export class ItemsService {
  constructor(@InjectRepository(Item) private readonly itemsRepository: Repository<Item>) {}

  async findAll(query: SearchItemDto): Promise<PaginatedResult<Item & { totalQty: number }>> {
    const builder = this.itemsRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.brand', 'brand')
      .where('item.is_active = true')
      .addSelect('(item.qty_showroom + item.qty_storage1 + item.qty_storage2)', 'totalQty');
    if (query.q) builder.andWhere('(item.code ILIKE :q OR item.description ILIKE :q OR item.category ILIKE :q)', { q: `%${query.q}%` });
    if (query.brand) builder.andWhere('brand.name ILIKE :brand', { brand: `%${query.brand}%` });
    if (query.category) builder.andWhere('item.category = :category', { category: query.category });
    if (query.inStock) builder.andWhere('(item.qty_showroom + item.qty_storage1 + item.qty_storage2) > 0');
    const sortColumn = query.sortBy === 'unitPrice' ? 'item.unit_price' : query.sortBy === 'brand' ? 'brand.name' : 'item.code';
    builder.orderBy(sortColumn, query.sortOrder).skip((query.page - 1) * query.limit).take(query.limit);
    const [data, total] = await builder.getManyAndCount();
    return { data: data as (Item & { totalQty: number })[], meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async findOne(code: string): Promise<Item> {
    const item = await this.itemsRepository.findOne({ where: { code: code.toUpperCase(), isActive: true }, relations: ['brand', 'photos'] });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  async findOneById(id: number): Promise<Item> {
    const item = await this.itemsRepository.findOne({ where: { id }, relations: ['brand', 'photos'] });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  getStockSummaryFromItem(item: Item): StockSummary {
    return { showroom: item.qtyShowroom, storage1: item.qtyStorage1, storage2: item.qtyStorage2, total: item.qtyShowroom + item.qtyStorage1 + item.qtyStorage2, qtySold: item.qtySold };
  }

  async getStockSummary(code: string): Promise<StockSummary> { return this.getStockSummaryFromItem(await this.findOne(code)); }

  async create(dto: CreateItemDto): Promise<Item> {
    if (await this.itemsRepository.findOne({ where: { code: dto.code } })) throw new ConflictException('Item code already exists');
    const item = this.itemsRepository.create({ ...dto, brand: { id: dto.brandId } as Brand, initialQty: dto.initialQty ?? 0 });
    item.qtyShowroom = dto.initialLocationId === 1 ? dto.initialQty ?? 0 : 0;
    item.qtyStorage1 = dto.initialLocationId === 2 ? dto.initialQty ?? 0 : 0;
    item.qtyStorage2 = dto.initialLocationId === 3 ? dto.initialQty ?? 0 : 0;
    return this.itemsRepository.save(item);
  }

  async update(code: string, dto: UpdateItemDto): Promise<Item> { const item = await this.findOne(code); Object.assign(item, { ...dto, brand: dto.brandId ? { id: dto.brandId } as Brand : item.brand }); return this.itemsRepository.save(item); }
  async softDelete(code: string): Promise<void> { const item = await this.findOne(code); item.isActive = false; await this.itemsRepository.save(item); }
  getQtyAtLocation(item: Item, locationId: number): number { return locationId === 1 ? item.qtyShowroom : locationId === 2 ? item.qtyStorage1 : locationId === 3 ? item.qtyStorage2 : 0; }
  setQtyAtLocation(item: Item, locationId: number, quantity: number): void { if (locationId === 1) item.qtyShowroom = quantity; else if (locationId === 2) item.qtyStorage1 = quantity; else if (locationId === 3) item.qtyStorage2 = quantity; }
}
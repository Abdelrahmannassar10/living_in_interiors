import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Brand } from '../brands/entities/brand.entity';
import { Location } from '../locations/entities/location.entity';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { AdjustmentReason, AdjustmentType, TransactionType } from '../common/enums/transaction-type.enum';
import { CreateItemDto } from './dto/create-item.dto';
import { SearchItemDto } from './dto/search-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Item } from './entities/item.entity';
import { ItemPhoto } from './entities/item-photo.entity';
import { ItemStock } from './entities/item-stock.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { UploadsService } from '../uploads/uploads.service';

export interface StockRowSummary { locationId: number; locationName: string; onHand: number; reserved: number; available: number; }
export interface StockSummary { locations: StockRowSummary[]; totalOnHand: number; totalReserved: number; totalAvailable: number; qtySold: number; }

const AVAILABLE_SQL = 'COALESCE(stock_sum.on_hand, 0) - COALESCE(stock_sum.reserved, 0)';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item) private readonly itemsRepository: Repository<Item>,
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
  ) {}

  /** Subquery that joins aggregated stock onto the items qb: stock_sum.on_hand / stock_sum.reserved */
  private withStockAggregates(builder: ReturnType<Repository<Item>['createQueryBuilder']>) {
    return builder
      .leftJoin(
        (qb) => qb.select('s.item_id', 'item_id')
          .addSelect('SUM(s.qty_on_hand)', 'on_hand')
          .addSelect('SUM(s.qty_reserved)', 'reserved')
          .from(ItemStock, 's')
          .groupBy('s.item_id'),
        'stock_sum',
        'stock_sum.item_id = item.id',
      );
  }

  async findAll(query: SearchItemDto): Promise<PaginatedResult<Item>> {
    let builder = this.itemsRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.brand', 'brand')
      .where('item.is_active = true');
    builder = this.withStockAggregates(builder)
      .addSelect('COALESCE(stock_sum.on_hand, 0)', 'on_hand')
      .addSelect(`(${AVAILABLE_SQL})`, 'available_qty');
    if (query.q) builder.andWhere('(item.code ILIKE :q OR item.description ILIKE :q OR item.category ILIKE :q)', { q: `%${query.q}%` });
    if (query.brand) builder.andWhere('brand.name ILIKE :brand', { brand: `%${query.brand}%` });
    if (query.category) builder.andWhere('item.category = :category', { category: query.category });
    if (query.inStock === true) builder.andWhere(`COALESCE(stock_sum.on_hand, 0) > 0`);
    if (query.inStock === false) builder.andWhere('COALESCE(stock_sum.on_hand, 0) = 0');
    const sortColumn = query.sortBy === 'unitPrice' ? 'item.unit_price' : query.sortBy === 'brand' ? 'brand.name' : 'item.code';
    builder.orderBy(sortColumn, query.sortOrder).skip((query.page - 1) * query.limit).take(query.limit);
    const [data, total] = await builder.getManyAndCount();
    return { data, meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  /** All active items whose total availability is at or below their threshold — computed in SQL. */
  async findLowStock(): Promise<Item[]> {
    let builder = this.itemsRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.brand', 'brand')
      .where('item.is_active = true');
    builder = this.withStockAggregates(builder);
    builder.andWhere(`COALESCE(stock_sum.on_hand, 0) - COALESCE(stock_sum.reserved, 0) <= item.low_stock_threshold`);
    return builder.getMany();
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

  async getStockSummary(code: string): Promise<StockSummary> {
    const item = await this.itemsRepository.findOne({ where: { code: code.toUpperCase(), isActive: true }, relations: ['photos'] });
    if (!item) throw new NotFoundException('Item not found');
    const stocks = await this.dataSource.getRepository(ItemStock).find({ where: { item: { id: item.id } }, relations: ['location'] });
    const locations: StockRowSummary[] = stocks.map((stock) => ({
      locationId: stock.location.id, locationName: stock.location.name,
      onHand: stock.qtyOnHand, reserved: stock.qtyReserved, available: stock.qtyOnHand - stock.qtyReserved,
    }));
    return {
      locations,
      totalOnHand: locations.reduce((sum, row) => sum + row.onHand, 0),
      totalReserved: locations.reduce((sum, row) => sum + row.reserved, 0),
      totalAvailable: locations.reduce((sum, row) => sum + row.available, 0),
      qtySold: item.qtySold,
    };
  }

  async create(dto: CreateItemDto, actorId?: number): Promise<Item> {
    const code = dto.code.toUpperCase();
    if (await this.itemsRepository.findOne({ where: { code } })) throw new ConflictException('Item code already exists');
    if (dto.brandId) {
      const brand = await this.dataSource.getRepository(Brand).findOne({ where: { id: dto.brandId, isActive: true } });
      if (!brand) throw new NotFoundException('Brand not found');
    }
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.save(manager.create(Item, { ...dto, code, brand: dto.brandId ? { id: dto.brandId } as Brand : null, initialQty: dto.initialQty ?? 0, createdBy: actorId ? { id: actorId } : null }));
      if ((dto.initialQty ?? 0) > 0) {
        if (!dto.initialLocationId) throw new BadRequestException('initialLocationId is required when initialQty is provided');
        const location = await manager.findOne(Location, { where: { id: dto.initialLocationId } });
        if (!location) throw new NotFoundException('Initial location not found');
        if (!location.isPhysical) throw new BadRequestException(`${location.name} is not a physical location`);
        await manager.save(manager.create(ItemStock, { item, location, qtyOnHand: dto.initialQty!, qtyReserved: 0 }));
        await manager.save(manager.create(Transaction, {
          item, transactionType: TransactionType.Adjustment, adjustmentType: AdjustmentType.Increase,
          adjustmentReason: AdjustmentReason.NewArrival, toLocation: location, qty: dto.initialQty!,
          stockBefore: {}, stockAfter: { [String(location.id)]: { onHand: dto.initialQty!, reserved: 0 } },
          createdBy: actorId ? { id: actorId } : null,
        }));
      }
      return item;
    });
  }

  async update(code: string, dto: UpdateItemDto): Promise<Item> {
    const item = await this.findOne(code);
    if (dto.brandId) {
      const brand = await this.dataSource.getRepository(Brand).findOne({ where: { id: dto.brandId, isActive: true } });
      if (!brand) throw new NotFoundException('Brand not found');
    }
    const { brandId, ...rest } = dto;
    Object.assign(item, rest, brandId ? { brand: { id: brandId } as Brand } : {});
    return this.itemsRepository.save(item);
  }

  async softDelete(code: string): Promise<void> {
    const item = await this.findOne(code);
    item.isActive = false;
    await this.itemsRepository.save(item);
  }

  async addPhoto(code: string, file: Express.Multer.File): Promise<ItemPhoto> {
    const item = await this.findOne(code);
    const result = await this.uploads.uploadItemPhoto(file, item.code);
    const isFirst = (await this.dataSource.getRepository(ItemPhoto).count({ where: { item: { id: item.id } } })) === 0;
    return this.dataSource.getRepository(ItemPhoto).save(this.dataSource.getRepository(ItemPhoto).create({
      item, publicId: result.publicId, fileUrl: result.fileUrl, thumbnailUrl: result.thumbnailUrl ?? null,
      fileName: result.fileName ?? file.originalname, fileSize: result.fileSize ?? null, mimeType: result.mimeType ?? file.mimetype,
      isPrimary: isFirst, sortOrder: 0,
    }));
  }

  async deletePhoto(code: string, photoId: number): Promise<void> {
    const item = await this.findOne(code);
    const photo = await this.dataSource.getRepository(ItemPhoto).findOne({ where: { id: photoId, item: { id: item.id } } });
    if (!photo) throw new NotFoundException('Photo not found');
    await this.dataSource.getRepository(ItemPhoto).remove(photo);
    await this.uploads.deleteFile(photo.publicId).catch(() => undefined);
  }

  async setPrimaryPhoto(code: string, photoId: number): Promise<ItemPhoto> {
    const item = await this.findOne(code);
    const repo = this.dataSource.getRepository(ItemPhoto);
    const photo = await repo.findOne({ where: { id: photoId, item: { id: item.id } } });
    if (!photo) throw new NotFoundException('Photo not found');
    await repo.update({ item: { id: item.id } }, { isPrimary: false });
    photo.isPrimary = true;
    return repo.save(photo);
  }

  async getPrimaryPhotoUrl(code: string): Promise<string | null> {
    const item = await this.itemsRepository.findOne({ where: { code: code.toUpperCase() } });
    if (!item) return null;
    const photo = await this.dataSource.getRepository(ItemPhoto).findOne({ where: { item: { id: item.id }, isPrimary: true } })
      ?? await this.dataSource.getRepository(ItemPhoto).findOne({ where: { item: { id: item.id } }, order: { id: 'ASC' } });
    return photo?.thumbnailUrl ?? photo?.fileUrl ?? null;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Brand } from '../brands/entities/brand.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Supplier } from './entities/supplier.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
  ) {}

  findAll(search?: string) {
    return this.suppliers.find({
      where: search
        ? { isActive: true, name: ILike(`%${search}%`) }
        : { isActive: true },
      relations: ['brand'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number) {
    const supplier = await this.suppliers.findOne({
      where: { id, isActive: true },
      relations: ['brand'],
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async create(dto: CreateSupplierDto, actorId?: number) {
    if (dto.brandId) {
      const brand = await this.brands.findOne({
        where: { id: dto.brandId, isActive: true },
      });
      if (!brand) throw new NotFoundException('Brand not found');
    }
    const { brandId, ...rest } = dto;
    return this.suppliers.save(
      this.suppliers.create({
        ...rest,
        brand: brandId ? { id: brandId } : null,
        createdBy: actorId ? { id: actorId } : null,
      }),
    );
  }

  async update(id: number, dto: UpdateSupplierDto) {
    const supplier = await this.findOne(id);
    if (dto.brandId) {
      const brand = await this.brands.findOne({
        where: { id: dto.brandId, isActive: true },
      });
      if (!brand) throw new NotFoundException('Brand not found');
    }
    const { brandId, ...rest } = dto;
    Object.assign(
      supplier,
      rest,
      brandId !== undefined
        ? { brand: brandId ? ({ id: brandId } as Brand) : null }
        : {},
    );
    return this.suppliers.save(supplier);
  }

  async deactivate(id: number) {
    const supplier = await this.findOne(id);
    supplier.isActive = false;
    await this.suppliers.save(supplier);
  }
}

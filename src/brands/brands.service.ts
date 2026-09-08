import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Brand } from './entities/brand.entity';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandsRepository: Repository<Brand>,
  ) {}
  findAll(search?: string) {
    return this.brandsRepository.find({
      where: {
        isActive: true,
        ...(search ? { name: ILike(`%${search}%`) } : {}),
      },
      order: { name: 'ASC' },
    });
  }
  async findOne(id: number) {
    const brand = await this.brandsRepository.findOne({
      where: { id, isActive: true },
    });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }
  create(dto: CreateBrandDto) {
    return this.brandsRepository.save(this.brandsRepository.create(dto));
  }
  async update(id: number, dto: UpdateBrandDto) {
    const brand = await this.findOne(id);
    Object.assign(brand, dto);
    return this.brandsRepository.save(brand);
  }
  async deactivate(id: number) {
    const brand = await this.findOne(id);
    brand.isActive = false;
    await this.brandsRepository.save(brand);
  }
}

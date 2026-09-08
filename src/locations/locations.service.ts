import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateLocationDto } from './dto/create-location.dto';
import { Location } from './entities/location.entity';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location)
    private readonly locationsRepository: Repository<Location>,
  ) {}
  findAll() {
    return this.locationsRepository.find({ order: { id: 'ASC' } });
  }
  async findOne(id: number) {
    const location = await this.locationsRepository.findOne({ where: { id } });
    if (!location)
      throw new NotFoundException(`Location with ID ${id} not found`);
    return location;
  }
  async findByName(name: string) {
    const location = await this.locationsRepository.findOne({
      where: { name },
    });
    if (!location) throw new NotFoundException(`Location ${name} not found`);
    return location;
  }
  create(dto: CreateLocationDto) {
    return this.locationsRepository.save(this.locationsRepository.create(dto));
  }
  async update(id: number, dto: Partial<CreateLocationDto>) {
    const location = await this.findOne(id);
    Object.assign(location, dto);
    return this.locationsRepository.save(location);
  }
}

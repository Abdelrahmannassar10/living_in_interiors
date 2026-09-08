import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}
  log(entry: Partial<AuditLog>) {
    return this.logs.save(this.logs.create(entry));
  }
  async findAll(query: PaginationDto): Promise<PaginatedResult<AuditLog>> {
    const [data, total] = await this.logs.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
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
  findByEntity(entity: string, entityId: string) {
    return this.logs.find({
      where: { entity, entityId },
      order: { createdAt: 'DESC' },
    });
  }
}

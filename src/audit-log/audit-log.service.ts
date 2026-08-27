import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}
  log(entry: Partial<AuditLog>) { return this.logs.save(this.logs.create(entry)); }
  findAll() { return this.logs.find({ order: { createdAt: 'DESC' }, take: 100 }); }
  findByEntity(entity: string, entityId: string) { return this.logs.find({ where: { entity, entityId }, order: { createdAt: 'DESC' } }); }
}
import { Controller, Get, Param } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
@Controller('audit-logs')
export class AuditLogController { constructor(private readonly service: AuditLogService) {} @Get() all() { return this.service.findAll(); } @Get(':entity/:id') entity(@Param('entity') entity: string, @Param('id') id: string) { return this.service.findByEntity(entity, id); } }
import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
@Controller('audit-logs')
@Roles(Role.Admin, Role.Manager)
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}
  @Get() all(@Query() query: PaginationDto) {
    return this.service.findAll(query);
  }
  @Get(':entity/:id') entity(
    @Param('entity') entity: string,
    @Param('id') id: string,
  ) {
    return this.service.findByEntity(entity, id);
  }
}

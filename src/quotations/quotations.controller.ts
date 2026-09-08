import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { QuotationsService } from './quotations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly service: QuotationsService) {}
  @Get() findAll(@Query() query: PaginationDto) { return this.service.findAll(query); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Get(':id/totals') totals(@Param('id', ParseIntPipe) id: number) { return this.service.computeTotals(id); }
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Post() create(@Body() dto: CreateQuotationDto, @CurrentUser() user?: { id: number }) { return this.service.create(dto, user?.id); }
  @Roles(Role.Admin, Role.Manager) @Patch(':id/status') updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStatusDto) { return this.service.updateStatus(id, dto.status); }
}

import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { Quotation } from './entities/quotation.entity';
import { QuotationsService } from './quotations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
@ApiTags('quotations')
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly service: QuotationsService) {}
  @ApiOperation({ summary: 'List quotations (paginated)' })
  @Get() findAll(@Query() query: PaginationDto) { return this.service.findAll(query); }
  @ApiOperation({ summary: 'Get a quotation with its lines' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: Quotation })
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @ApiOperation({ summary: 'Compute quotation totals' })
  @ApiParam({ name: 'id', type: Number })
  @Get(':id/totals') totals(@Param('id', ParseIntPipe) id: number) { return this.service.computeTotals(id); }
  @ApiOperation({ summary: 'Create a draft quotation' })
  @ApiCreatedResponse({ type: Quotation })
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Post() create(@Body() dto: CreateQuotationDto, @CurrentUser() user?: { id: number }) { return this.service.create(dto, user?.id); }
  @ApiOperation({ summary: 'Transition quotation status (Draft→Sent→Approved/Rejected, …)' })
  @ApiParam({ name: 'id', type: Number })
  @Roles(Role.Admin, Role.Manager) @Patch(':id/status') updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStatusDto) { return this.service.updateStatus(id, dto.status); }
}
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { QuotationsService } from './quotations.service';
@Controller('quotations')
export class QuotationsController { constructor(private readonly service: QuotationsService) {} @Get() findAll() { return this.service.findAll(); } @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); } @Get(':id/totals') totals(@Param('id', ParseIntPipe) id: number) { return this.service.computeTotals(id); } @Post() create(@Body() dto: CreateQuotationDto) { return this.service.create(dto); } @Patch(':id/status') updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStatusDto) { return this.service.updateStatus(id, dto.status); } }
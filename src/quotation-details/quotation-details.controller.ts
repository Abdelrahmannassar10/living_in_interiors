import { Body, Controller, Delete, Param, ParseIntPipe, Post } from '@nestjs/common';
import { AddItemDto } from './dto/add-item.dto';
import { QuotationDetailsService } from './quotation-details.service';
@Controller('quotation-details')
export class QuotationDetailsController { constructor(private readonly service: QuotationDetailsService) {} @Post() add(@Body() dto: AddItemDto) { return this.service.addItem(dto); } @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) { return this.service.softDelete(id); } }
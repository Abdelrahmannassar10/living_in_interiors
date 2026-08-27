import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateItemDto } from './dto/create-item.dto';
import { SearchItemDto } from './dto/search-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}
  @Get() findAll(@Query() query: SearchItemDto) { return this.itemsService.findAll(query); }
  @Get('low-stock') async lowStock() { const result = await this.itemsService.findAll({ page: 1, limit: 100, sortBy: 'code', sortOrder: 'ASC' }); return result.data.filter((item) => item.qtyShowroom + item.qtyStorage1 + item.qtyStorage2 <= item.lowStockThreshold); }
  @Get(':code') findOne(@Param('code') code: string) { return this.itemsService.findOne(code); }
  @Get(':code/stock') stock(@Param('code') code: string) { return this.itemsService.getStockSummary(code); }
  @Post() create(@Body() dto: CreateItemDto) { return this.itemsService.create(dto); }
  @Patch(':code') update(@Param('code') code: string, @Body() dto: UpdateItemDto) { return this.itemsService.update(code, dto); }
  @Delete(':code') remove(@Param('code') code: string) { return this.itemsService.softDelete(code); }
}
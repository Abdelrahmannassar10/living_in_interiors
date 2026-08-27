import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { BrandsService } from './brands.service';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}
  @Get() findAll(@Query('search') search?: string) { return this.brandsService.findAll(search); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.brandsService.findOne(id); }
  @Post() create(@Body() dto: CreateBrandDto) { return this.brandsService.create(dto); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandDto) { return this.brandsService.update(id, dto); }
  @Delete(':id') deactivate(@Param('id', ParseIntPipe) id: number) { return this.brandsService.deactivate(id); }
}
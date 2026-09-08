import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { BrandsService } from './brands.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}
  @Get() findAll(@Query('search') search?: string) {
    return this.brandsService.findAll(search);
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.brandsService.findOne(id);
  }
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Post() create(
    @Body() dto: CreateBrandDto,
  ) {
    return this.brandsService.create(dto);
  }
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Patch(':id') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBrandDto,
  ) {
    return this.brandsService.update(id, dto);
  }
  @Roles(Role.Admin, Role.Manager) @Delete(':id') deactivate(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.brandsService.deactivate(id);
  }
}

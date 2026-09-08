import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Request, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateItemDto } from './dto/create-item.dto';
import { SearchItemDto } from './dto/search-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemsService } from './items.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}
  @Get() findAll(@Query() query: SearchItemDto) { return this.itemsService.findAll(query); }
  @Get('low-stock') lowStock() { return this.itemsService.findLowStock(); }
  @Get(':code') findOne(@Param('code') code: string) { return this.itemsService.findOne(code); }
  @Get(':code/stock') stock(@Param('code') code: string) { return this.itemsService.getStockSummary(code); }
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Post() create(@Body() dto: CreateItemDto, @Request() request: { user?: { id: number } }) { return this.itemsService.create(dto, request.user?.id); }
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Patch(':code') update(@Param('code') code: string, @Body() dto: UpdateItemDto) { return this.itemsService.update(code, dto); }
  @Roles(Role.Admin, Role.Manager) @Delete(':code') remove(@Param('code') code: string) { return this.itemsService.softDelete(code); }

  @Roles(Role.Admin, Role.Manager, Role.Staff) @Post(':code/photos')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => file.mimetype.startsWith('image/') ? callback(null, true) : callback(new BadRequestException('Only image files are allowed'), false),
  }))
  addPhoto(@Param('code') code: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Photo file is required');
    return this.itemsService.addPhoto(code, file);
  }

  @Roles(Role.Admin, Role.Manager, Role.Staff) @Delete(':code/photos/:photoId') deletePhoto(@Param('code') code: string, @Param('photoId', ParseIntPipe) photoId: number) { return this.itemsService.deletePhoto(code, photoId); }
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Patch(':code/photos/:photoId/primary') setPrimaryPhoto(@Param('code') code: string, @Param('photoId', ParseIntPipe) photoId: number) { return this.itemsService.setPrimaryPhoto(code, photoId); }
}

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
  Request,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Supplier } from './entities/supplier.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@ApiTags('suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}
  @ApiOperation({ summary: 'List active suppliers (optional search)' })
  @ApiOkResponse({ type: [Supplier] })
  @Get()
  findAll(@Query('search') search?: string) {
    return this.suppliersService.findAll(search);
  }
  @ApiOperation({ summary: 'Get one supplier' })
  @ApiParam({ name: 'id', type: Number })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.suppliersService.findOne(id);
  }
  @ApiOperation({ summary: 'Create a supplier' })
  @Roles(Role.Admin, Role.Manager, Role.Staff)
  @Post()
  create(
    @Body() dto: CreateSupplierDto,
    @Request() request: { user?: { id: number } },
  ) {
    return this.suppliersService.create(dto, request.user?.id);
  }
  @ApiOperation({ summary: 'Update a supplier' })
  @ApiParam({ name: 'id', type: Number })
  @Roles(Role.Admin, Role.Manager, Role.Staff)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(id, dto);
  }
  @ApiOperation({ summary: 'Soft-deactivate a supplier' })
  @ApiParam({ name: 'id', type: Number })
  @Roles(Role.Admin, Role.Manager)
  @Delete(':id')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.suppliersService.deactivate(id);
  }
}

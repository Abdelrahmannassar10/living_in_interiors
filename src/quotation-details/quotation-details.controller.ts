import { Body, Controller, Delete, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateQuotationDetailDto } from './dto/update-detail.dto';
import { QuotationDetail } from './entities/quotation-detail.entity';
import { QuotationDetailsService } from './quotation-details.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
@ApiTags('quotation-details')
@Controller('quotation-details')
export class QuotationDetailsController {
  constructor(private readonly service: QuotationDetailsService) {}
  @ApiOperation({ summary: 'Add a line to a Draft quotation' })
  @ApiCreatedResponse({ type: QuotationDetail })
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Post() add(@Body() dto: AddItemDto, @CurrentUser() user?: { id: number }) { return this.service.addItem(dto, user?.id); }
  @ApiOperation({ summary: 'Edit a quotation line (Draft only)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: QuotationDetail })
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuotationDetailDto, @CurrentUser() user?: { id: number }) { return this.service.updateItem(id, dto, user?.id); }
  @ApiOperation({ summary: 'Soft-delete a quotation line (Draft only)' })
  @ApiParam({ name: 'id', type: Number })
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Delete(':id') remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: { id: number }) { return this.service.softDelete(id, user?.id); }
}
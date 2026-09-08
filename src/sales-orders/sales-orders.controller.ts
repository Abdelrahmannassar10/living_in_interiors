import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AddSalesOrderLineDto } from './dto/add-line.dto';
import { UpdateSalesOrderLineDto } from './dto/update-line.dto';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { CreateDeliveryDto } from '../deliveries/dto/create-delivery.dto';
import { SalesOrder } from './entities/sales-order.entity';
import { SalesOrdersService } from './sales-orders.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@ApiTags('sales-orders')
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(
    private readonly orders: SalesOrdersService,
    private readonly deliveries: DeliveriesService,
  ) {}
  @ApiOperation({ summary: 'List sales orders (with lines)' })
  @ApiOkResponse({ type: [SalesOrder] })
  @Get()
  findAll() {
    return this.orders.findAll();
  }
  @ApiOperation({ summary: 'Get one sales order' })
  @ApiParam({ name: 'id', type: Number })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.orders.findOne(id);
  }
  @ApiOperation({ summary: 'Create a Draft sales order' })
  @Roles(Role.Admin, Role.Manager, Role.Staff)
  @Post()
  create(
    @Body() dto: CreateSalesOrderDto,
    @Request() request: { user?: { id: number } },
  ) {
    return this.orders.create(dto, request.user?.id);
  }
  @ApiOperation({
    summary:
      'Create a Draft order from an Approved quotation (one active order per quote)',
  })
  @Roles(Role.Admin, Role.Manager)
  @Post('from-quotation/:quotationId')
  fromQuotation(
    @Param('quotationId', ParseIntPipe) quotationId: number,
    @Request() request: { user?: { id: number } },
  ) {
    return this.orders.createFromQuotation(quotationId, request.user?.id);
  }
  @ApiOperation({ summary: 'Add a line to a Draft order' })
  @ApiParam({ name: 'id', type: Number })
  @Roles(Role.Admin, Role.Manager, Role.Staff)
  @Post(':id/lines')
  addLine(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddSalesOrderLineDto,
  ) {
    return this.orders.addLine(id, dto);
  }
  @ApiOperation({ summary: 'Edit an order line (Draft only)' })
  @Roles(Role.Admin, Role.Manager, Role.Staff)
  @Patch('lines/:lineId')
  updateLine(
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() dto: UpdateSalesOrderLineDto,
  ) {
    return this.orders.updateLine(lineId, dto);
  }
  @ApiOperation({ summary: 'Remove an order line (Draft only)' })
  @Roles(Role.Admin, Role.Manager, Role.Staff)
  @Delete('lines/:lineId')
  removeLine(@Param('lineId', ParseIntPipe) lineId: number) {
    return this.orders.removeLine(lineId);
  }
  @ApiOperation({
    summary:
      'Confirm the order: reserves stock (showroom-first) and flags shortages',
  })
  @Roles(Role.Admin, Role.Manager)
  @Post(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.orders.confirm(id);
  }
  @ApiOperation({ summary: 'Cancel the order: releases reservations' })
  @Roles(Role.Admin, Role.Manager)
  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.orders.cancel(id);
  }
  @ApiOperation({
    summary:
      'Create a delivery against this order (consumes reserved stock, auto-Closes when fully delivered)',
  })
  @Roles(Role.Admin, Role.Manager, Role.Staff)
  @Post(':id/deliveries')
  createDelivery(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDeliveryDto,
    @Request() request: { user?: { id: number } },
  ) {
    return this.deliveries.create(id, dto, request.user?.id);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { CreateFromSuggestionsDto } from './dto/create-from-suggestions.dto';
import { ReceiveGoodsDto } from './dto/receive-goods.dto';
import { ReturnToSupplierDto } from './dto/return-to-supplier.dto';

@ApiTags('purchase-orders')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @ApiOperation({
    summary:
      'Suggested-PO report: stock-low items joined with their latest supplier price',
  })
  @Get('suggestions')
  suggestions() {
    return this.purchaseOrders.suggestions();
  }

  @ApiOperation({
    summary: 'One-click draft POs from the current stock-low suggestions',
  })
  @ApiBody({ type: CreateFromSuggestionsDto })
  @Roles(Role.Admin, Role.Manager)
  @Post('from-suggestions')
  createFromSuggestions(
    @Body() dto: CreateFromSuggestionsDto,
    @Request() request: { user?: { id: number } },
  ) {
    return this.purchaseOrders.createFromSuggestions(dto, request.user?.id);
  }

  @ApiOperation({ summary: 'List purchase orders' })
  @ApiOkResponse({ type: [PurchaseOrder] })
  @Get()
  findAll() {
    return this.purchaseOrders.findAll();
  }

  @ApiOperation({ summary: 'Get a purchase order with its lines and receipts' })
  @ApiParam({ name: 'id', type: Number })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseOrders.findOne(id);
  }

  @ApiOperation({ summary: 'Create a Draft purchase order' })
  @Roles(Role.Admin, Role.Manager)
  @Post()
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @Request() request: { user?: { id: number } },
  ) {
    return this.purchaseOrders.create(dto, request.user?.id);
  }

  @ApiOperation({ summary: 'Mark a Draft purchase order as Sent' })
  @Roles(Role.Admin, Role.Manager)
  @Post(':id/send')
  send(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseOrders.send(id);
  }

  @ApiOperation({
    summary: 'Cancel a purchase order (Draft/Sent/PartiallyReceived)',
  })
  @Roles(Role.Admin, Role.Manager)
  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseOrders.cancel(id);
  }

  @ApiOperation({ summary: 'Close a fully Received purchase order' })
  @Roles(Role.Admin, Role.Manager)
  @Post(':id/close')
  close(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseOrders.close(id);
  }

  @ApiOperation({
    summary:
      'Receive goods against the purchase order (partial receipts allowed, over-receipt blocked)',
  })
  @Roles(Role.Admin, Role.Manager)
  @Post(':id/goods-receipts')
  receiveGoods(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReceiveGoodsDto,
    @Request() request: { user?: { id: number } },
  ) {
    return this.purchaseOrders.receiveGoods(id, dto, request.user?.id);
  }

  @ApiOperation({
    summary: 'Return already-received goods to the supplier',
  })
  @Roles(Role.Admin, Role.Manager)
  @Post(':id/return-to-supplier')
  returnToSupplier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnToSupplierDto,
    @Request() request: { user?: { id: number } },
  ) {
    return this.purchaseOrders.returnToSupplier(id, dto, request.user?.id);
  }
}

@ApiTags('goods-receipts')
@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @ApiOperation({ summary: 'List goods receipts' })
  @ApiOkResponse({ type: [GoodsReceipt] })
  @Get()
  findAll() {
    return this.purchaseOrders.listReceipts();
  }
}

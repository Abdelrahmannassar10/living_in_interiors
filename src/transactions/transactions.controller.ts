import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Request } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransactionSearchDto } from './dto/search-transaction.dto';
import { Transaction } from './entities/transaction.entity';
import { TransactionsService } from './transactions.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}
  @ApiOperation({ summary: 'List stock transactions (paginated, filterable)' })
  @ApiOkResponse({ type: [Transaction] })
  @Get() findAll(@Query() query: TransactionSearchDto) { return this.transactionsService.findAll(query); }
  @ApiOperation({ summary: 'Get one transaction' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: Transaction })
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.transactionsService.findOne(id); }
  @ApiOperation({ summary: 'Move stock between physical locations' })
  @ApiCreatedResponse({ type: Transaction })
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Post('transfer') transfer(@Body() dto: CreateTransferDto, @Request() request: { user?: { id: number } }) { return this.transactionsService.createTransfer(dto, request.user?.id); }
  @ApiOperation({ summary: 'Record a sale (decrements stock)' })
  @ApiCreatedResponse({ type: Transaction })
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Post('sale') sale(@Body() dto: CreateSaleDto, @Request() request: { user?: { id: number } }) { return this.transactionsService.createSale(dto, request.user?.id); }
  @ApiOperation({ summary: 'Record a customer return (increments stock)' })
  @ApiCreatedResponse({ type: Transaction })
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Post('return') return(@Body() dto: CreateReturnDto, @Request() request: { user?: { id: number } }) { return this.transactionsService.createReturn(dto, request.user?.id); }
  @ApiOperation({ summary: 'Stock adjustment (Increase/Decrease, reason required)' })
  @ApiCreatedResponse({ type: Transaction })
  @Roles(Role.Admin, Role.Manager) @Post('adjustment') adjustment(@Body() dto: CreateAdjustmentDto, @Request() request: { user?: { id: number } }) { return this.transactionsService.createAdjustment(dto, request.user?.id); }
}
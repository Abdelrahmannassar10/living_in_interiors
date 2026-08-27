import { Body, Controller, Get, Param, ParseIntPipe, Post, Request } from '@nestjs/common';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}
  @Get() findAll() { return this.transactionsService.findAll(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.transactionsService.findOne(id); }
  @Post('transfer') transfer(@Body() dto: CreateTransferDto, @Request() request: { user?: { id: number } }) { return this.transactionsService.createTransfer(dto, request.user?.id); }
  @Post('sale') sale(@Body() dto: CreateSaleDto, @Request() request: { user?: { id: number } }) { return this.transactionsService.createSale(dto, request.user?.id); }
  @Post('return') return(@Body() dto: CreateReturnDto, @Request() request: { user?: { id: number } }) { return this.transactionsService.createReturn(dto, request.user?.id); }
  @Post('adjustment') adjustment(@Body() dto: CreateAdjustmentDto, @Request() request: { user?: { id: number } }) { return this.transactionsService.createAdjustment(dto, request.user?.id); }
}
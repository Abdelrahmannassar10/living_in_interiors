import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { FinanceService } from './finance.service';
import { Invoice } from './entities/invoice.entity';
import {
  CreateInvoiceFromOrderDto,
  CreateManualInvoiceDto,
} from './dto/create-invoice.dto';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly finance: FinanceService) {}

  @ApiOperation({
    summary:
      'AR aging report: open invoice balances bucketed 0-30 / 31-60 / 61-90 / 90+',
  })
  @Get('aging')
  aging() {
    return this.finance.aging();
  }

  @ApiOperation({ summary: 'AR aging report as a CSV document' })
  @ApiProduces('text/csv')
  @Get('aging.csv')
  async agingCsv(@Res() response: Response) {
    response
      .status(200)
      .contentType('text/csv')
      .setHeader('Content-Disposition', 'attachment; filename="ar-aging.csv"')
      .send(await this.finance.agingCsv());
  }

  @ApiOperation({ summary: 'List invoices (newest first)' })
  @ApiOkResponse({ type: [Invoice] })
  @Get()
  findAll() {
    return this.finance.findAll();
  }

  @ApiOperation({
    summary:
      'Create an invoice that snapshots the delivered quantities of a Delivered/Closed order',
  })
  @ApiBody({ type: CreateInvoiceFromOrderDto })
  @Roles(Role.Admin, Role.Manager)
  @Post()
  invoiceFromOrder(
    @Body() dto: CreateInvoiceFromOrderDto,
    @Request() request: { user?: { id: number } },
  ) {
    return this.finance.invoiceFromOrder(dto, request.user?.id);
  }

  @ApiOperation({
    summary:
      'Manual invoice (credit note = negative unit prices); totals are computed server-side',
  })
  @ApiBody({ type: CreateManualInvoiceDto })
  @Roles(Role.Admin, Role.Manager)
  @Post('manual')
  createManual(
    @Body() dto: CreateManualInvoiceDto,
    @Request() request: { user?: { id: number } },
  ) {
    return this.finance.createManualInvoice(dto, request.user?.id);
  }

  @ApiOperation({
    summary: 'Get an invoice with lines, allocations and its open balance',
  })
  @ApiParam({ name: 'id', type: Number })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.finance.findOne(id);
  }
}

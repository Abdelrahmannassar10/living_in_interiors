import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('quotation/:id/pdf') async quotation(
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    const pdf = await this.reports.generateQuotationPdf(id);
    response
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="quotation-${id}.pdf"`,
      })
      .send(pdf);
  }

  @Get('stock-valuation')
  stockValuation() {
    return this.reports.stockValuation();
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NumberingService } from '../common/services/numbering.service';
import { FinanceService } from './finance.service';
import { InvoicesController } from './invoices.controller';
import { PaymentsController } from './payments.controller';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLine } from './entities/invoice-line.entity';
import { Payment } from './entities/payment.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Invoice,
      InvoiceLine,
      Payment,
      PaymentAllocation,
    ]),
  ],
  controllers: [InvoicesController, PaymentsController],
  providers: [FinanceService, NumberingService],
  exports: [FinanceService],
})
export class FinanceModule {}

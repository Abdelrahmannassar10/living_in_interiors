import { forwardRef, Module } from '@nestjs/common';
import { QuotationsModule } from '../quotations/quotations.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
@Module({
  imports: [forwardRef(() => QuotationsModule)],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}

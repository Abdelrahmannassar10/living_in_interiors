import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { StockAlertsModule } from '../stock-alerts/stock-alerts.module';
import { LowStockDigestTask } from './low-stock-digest.task';
import { QuotationExpiryTask } from './quotation-expiry.task';

@Module({
  imports: [QuotationsModule, StockAlertsModule, NotificationsModule],
  providers: [QuotationExpiryTask, LowStockDigestTask],
})
export class TasksModule {}

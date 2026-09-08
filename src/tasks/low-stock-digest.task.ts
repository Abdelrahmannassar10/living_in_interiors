import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';
import { StockAlertsService } from '../stock-alerts/stock-alerts.service';

/** Daily 07:00 job: one low-stock digest email, all below-threshold items. */
@Injectable()
export class LowStockDigestTask {
  constructor(
    private readonly stockAlerts: StockAlertsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 7 * * *')
  async sendDailyDigest(): Promise<void> {
    const items = await this.stockAlerts.getAllAlerting();
    if (items.length === 0) return;
    await this.notifications.sendLowStockDigest(
      items.map((item) => ({
        code: item.code,
        description: item.description,
        available: item.available,
        threshold: item.threshold,
      })),
    );
  }
}

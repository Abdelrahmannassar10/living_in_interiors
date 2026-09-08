import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QuotationStatus } from '../common/enums/quotation-status.enum';
import { QuotationsService } from '../quotations/quotations.service';

/** Daily midnight job: Sent quotations past valid_until → Expired. */
@Injectable()
export class QuotationExpiryTask {
  private readonly logger = new Logger(QuotationExpiryTask.name);
  constructor(private readonly quotations: QuotationsService) {}

  @Cron('0 0 * * *')
  async expireOutdatedQuotations(): Promise<void> {
    const count = await this.quotations.expireOutdated();
    if (count > 0) {
      this.logger.log(
        `Expired ${count} quotation(s) past their valid_until (status=${QuotationStatus.Expired})`,
      );
    }
  }
}

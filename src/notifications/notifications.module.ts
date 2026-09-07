import { forwardRef, Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({ imports: [ReportsModule, forwardRef(() => QuotationsModule)], controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuotationDetail } from '../quotation-details/entities/quotation-detail.entity';
import { Quotation } from './entities/quotation.entity';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
@Module({ imports: [TypeOrmModule.forFeature([Quotation, QuotationDetail]), forwardRef(() => NotificationsModule)], controllers: [QuotationsController], providers: [QuotationsService], exports: [QuotationsService] })
export class QuotationsModule {}
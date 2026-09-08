import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GatewayModule } from '../gateway/gateway.module';
import { ReportsModule } from '../reports/reports.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { User } from '../users/entities/user.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User]),
    GatewayModule,
    ReportsModule,
    QuotationsModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

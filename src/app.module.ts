import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { appConfig, appValidationSchema } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UsersModule } from './users/users.module';
import { BrandsModule } from './brands/brands.module';
import { LocationsModule } from './locations/locations.module';
import { ItemsModule } from './items/items.module';
import { ClientsModule } from './clients/clients.module';
import { TransactionsModule } from './transactions/transactions.module';
import { QuotationsModule } from './quotations/quotations.module';
import { QuotationDetailsModule } from './quotation-details/quotation-details.module';
import { GatewayModule } from './gateway/gateway.module';
import { UploadsModule } from './uploads/uploads.module';
import { ReportsModule } from './reports/reports.module';
import { StockAlertsModule } from './stock-alerts/stock-alerts.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { SalesOrdersModule } from './sales-orders/sales-orders.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { ReservationsModule } from './reservations/reservations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validationSchema: appValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: databaseConfig,
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    BrandsModule,
    LocationsModule,
    ItemsModule,
    ClientsModule,
    TransactionsModule,
    QuotationsModule,
    QuotationDetailsModule,
    GatewayModule,
    UploadsModule,
    ReportsModule,
    StockAlertsModule,
    AuditLogModule,
    DashboardModule,
    NotificationsModule,
    SuppliersModule,
    ReservationsModule,
    SalesOrdersModule,
    DeliveriesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

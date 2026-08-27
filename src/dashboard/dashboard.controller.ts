import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
@Controller('dashboard')
export class DashboardController { constructor(private readonly service: DashboardService) {} @Get('summary') summary() { return this.service.summary(); } @Get('recent-transactions') recent() { return this.service.recentTransactions(); } }
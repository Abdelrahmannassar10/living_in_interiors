import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  async getHealth() {
    const db = await this.appService.pingDb();
    return {
      status: db.up ? 'ok' : 'degraded',
      company: 'Living In interiors',
      version: process.env.npm_package_version ?? '0.0.1',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      db,
    };
  }
}

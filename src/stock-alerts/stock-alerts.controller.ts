import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { SetAlertConfigDto } from './dto/set-alert-config.dto';
import { StockAlertsService } from './stock-alerts.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
@Controller('stock-alerts')
export class StockAlertsController {
  constructor(private readonly service: StockAlertsService) {}
  @Get() all() { return this.service.getAllAlertingItems(); }
  @Get(':itemId') config(@Param('itemId', ParseIntPipe) id: number) { return this.service.getConfig(id); }
  @Roles(Role.Admin, Role.Manager) @Put(':itemId') set(@Param('itemId', ParseIntPipe) id: number, @Body() dto: SetAlertConfigDto) { return this.service.setConfig(id, dto); }
}

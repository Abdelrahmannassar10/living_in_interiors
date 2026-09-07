import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { SendQuotationEmailDto } from './dto/send-quotation-email.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('quotations/:id/send-email')
  sendQuotation(@Param('id', ParseIntPipe) id: number, @Body() dto: SendQuotationEmailDto): Promise<void> {
    return this.notifications.sendQuotationEmail(id, dto.email);
  }

  @Post('quotations/:id/test-email')
  testQuotationEmail(@Param('id', ParseIntPipe) id: number, @Body() dto: SendQuotationEmailDto) {
    return this.notifications.testQuotationEmail(id, dto.email);
  }
}
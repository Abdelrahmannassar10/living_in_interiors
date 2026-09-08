import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SendQuotationEmailDto } from './dto/send-quotation-email.dto';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Current user's inbox, newest first. */
  @Get()
  findAll(
    @Request() request: { user?: { id: number } },
  ): Promise<Notification[]> {
    return this.notifications.findAllForUser(request.user!.id);
  }

  @Patch(':id/read')
  markRead(
    @Request() request: { user?: { id: number } },
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Notification> {
    return this.notifications.markAsRead(request.user!.id, id);
  }

  @Post('quotations/:id/send-email')
  sendQuotation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendQuotationEmailDto,
  ): Promise<void> {
    return this.notifications.sendQuotationEmail(id, dto.email);
  }

  @Post('quotations/:id/test-email')
  testQuotationEmail(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendQuotationEmailDto,
  ) {
    return this.notifications.testQuotationEmail(id, dto.email);
  }
}

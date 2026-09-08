import {
  Body,
  Controller,
  Get,
  Optional,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { FinanceService } from './finance.service';
import { Payment } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly finance: FinanceService) {}

  @ApiOperation({
    summary:
      'Record a client payment and allocate it FIFO against the oldest open invoices',
  })
  @ApiBody({ type: CreatePaymentDto })
  @Roles(Role.Admin, Role.Manager)
  @Post()
  create(
    @Body() dto: CreatePaymentDto,
    @Request() request: { user?: { id: number } },
  ) {
    return this.finance.createPayment(dto, request.user?.id);
  }

  @ApiOperation({ summary: 'List payments (optionally filtered by client)' })
  @ApiOkResponse({ type: [Payment] })
  @Get()
  findAll(@Optional() @Query('clientId') clientId?: string) {
    return this.finance.listPayments(clientId ? Number(clientId) : undefined);
  }
}

import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Delivery } from './entities/delivery.entity';
import { DeliveriesService } from './deliveries.service';

@ApiTags('deliveries')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}
  @ApiOperation({ summary: 'List deliveries' })
  @ApiOkResponse({ type: [Delivery] })
  @Get()
  findAll() {
    return this.deliveries.findAll();
  }
  @ApiOperation({ summary: 'Get one delivery' })
  @ApiParam({ name: 'id', type: Number })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.deliveries.findOne(id);
  }
}

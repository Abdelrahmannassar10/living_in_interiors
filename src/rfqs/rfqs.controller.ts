import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { UpdateRfqDto } from './dto/update-rfq.dto';
import { UpdateRfqStatusDto } from './dto/update-rfq-status.dto';
import { AddRfqLineDto } from './dto/add-rfq-line.dto';
import { UpdateRfqLineDto } from './dto/update-rfq-line.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Rfq } from './entities/rfq.entity';
import { RfqLine } from './entities/rfq-line.entity';
import { RfqsService } from './rfqs.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@ApiTags('rfqs')
@Controller('rfqs')
export class RfqsController {
  constructor(private readonly service: RfqsService) {}

  @ApiOperation({ summary: 'List RFQs (paginated)' })
  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.service.findAll(query);
  }

  @ApiOperation({ summary: 'Get an RFQ with its lines' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: Rfq })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Create a draft RFQ' })
  @ApiCreatedResponse({ type: Rfq })
  @Roles(Role.Admin, Role.Manager, Role.Staff)
  @Post()
  create(@Body() dto: CreateRfqDto, @CurrentUser() user?: { id: number }) {
    return this.service.create(dto, user?.id);
  }

  @ApiOperation({ summary: 'Update an RFQ header (Draft only)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: Rfq })
  @Roles(Role.Admin, Role.Manager, Role.Staff)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRfqDto) {
    return this.service.update(id, dto);
  }

  @ApiOperation({
    summary:
      'Transition RFQ status (Draft→Sent→Received→Awarded, or Cancelled)',
  })
  @ApiParam({ name: 'id', type: Number })
  @Roles(Role.Admin, Role.Manager)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRfqStatusDto,
  ) {
    return this.service.updateStatus(id, dto.status);
  }

  @ApiOperation({ summary: 'Add a line to a Draft RFQ' })
  @ApiCreatedResponse({ type: RfqLine })
  @Roles(Role.Admin, Role.Manager, Role.Staff)
  @Post('lines')
  addLine(@Body() dto: AddRfqLineDto) {
    return this.service.addLine(dto);
  }

  @ApiOperation({ summary: 'Update an RFQ line (Draft only)' })
  @ApiParam({ name: 'lineId', type: Number })
  @ApiOkResponse({ type: RfqLine })
  @Roles(Role.Admin, Role.Manager, Role.Staff)
  @Patch('lines/:lineId')
  updateLine(
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() dto: UpdateRfqLineDto,
  ) {
    return this.service.updateLine(lineId, dto);
  }

  @ApiOperation({ summary: 'Soft-delete an RFQ line (Draft only)' })
  @ApiParam({ name: 'lineId', type: Number })
  @Roles(Role.Admin, Role.Manager, Role.Staff)
  @Delete('lines/:lineId')
  removeLine(@Param('lineId', ParseIntPipe) lineId: number) {
    return this.service.removeLine(lineId);
  }
}

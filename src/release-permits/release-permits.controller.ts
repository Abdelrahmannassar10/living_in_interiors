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
import { CreateReleasePermitDto } from './dto/create-release-permit.dto';
import { UpdateReleasePermitStatusDto } from './dto/update-release-permit-status.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ReleasePermit } from './entities/release-permit.entity';
import { ReleasePermitLine } from './entities/release-permit-line.entity';
import { ReleasePermitsService } from './release-permits.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@ApiTags('release-permits')
@Controller('release-permits')
export class ReleasePermitsController {
  constructor(private readonly service: ReleasePermitsService) {}

  @ApiOperation({ summary: 'List release permits (paginated)' })
  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.service.findAll(query);
  }

  @ApiOperation({ summary: 'Get a release permit with its lines' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ReleasePermit })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Create a draft release permit from a sales order' })
  @ApiCreatedResponse({ type: ReleasePermit })
  @Roles(Role.Admin, Role.Manager)
  @Post()
  create(
    @Body() dto: CreateReleasePermitDto,
    @CurrentUser() user?: { id: number },
  ) {
    return this.service.create(dto, user?.id);
  }

  @ApiOperation({
    summary: 'Transition permit status (Draft→Approved→Released, or Cancelled)',
  })
  @ApiParam({ name: 'id', type: Number })
  @Roles(Role.Admin, Role.Manager)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReleasePermitStatusDto,
    @CurrentUser() user?: { id: number },
  ) {
    return this.service.updateStatus(id, dto.status, user?.id);
  }

  @ApiOperation({ summary: 'Add a line to a Draft permit' })
  @ApiCreatedResponse({ type: ReleasePermitLine })
  @Roles(Role.Admin, Role.Manager)
  @Post(':id/lines')
  addLine(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { salesOrderLineId: number; qty: number },
  ) {
    return this.service.addLine(id, body.salesOrderLineId, body.qty);
  }

  @ApiOperation({ summary: 'Remove a line from a Draft permit' })
  @ApiParam({ name: 'lineId', type: Number })
  @Roles(Role.Admin, Role.Manager)
  @Delete(':id/lines/:lineId')
  removeLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
  ) {
    return this.service.removeLine(lineId);
  }
}

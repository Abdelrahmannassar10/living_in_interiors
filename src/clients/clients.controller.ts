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
  Request,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}
  @Get() findAll(@Query('search') search?: string) {
    return this.clientsService.findAll(search);
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.findOne(id);
  }
  @Get(':id/history') history(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.history(id);
  }
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Post() create(
    @Body() dto: CreateClientDto,
    @Request() request: { user?: { id: number } },
  ) {
    return this.clientsService.create(dto, request.user?.id);
  }
  @Roles(Role.Admin, Role.Manager, Role.Staff) @Patch(':id') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(id, dto);
  }
  @Roles(Role.Admin, Role.Manager) @Delete(':id') deactivate(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.clientsService.deactivate(id);
  }
}

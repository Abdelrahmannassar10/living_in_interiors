import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateLocationDto } from './dto/create-location.dto';
import { LocationsService } from './locations.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}
  @Get() findAll() {
    return this.locationsService.findAll();
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.locationsService.findOne(id);
  }
  @Roles(Role.Admin, Role.Manager) @Post() create(
    @Body() dto: CreateLocationDto,
  ) {
    return this.locationsService.create(dto);
  }
  @Roles(Role.Admin, Role.Manager) @Patch(':id') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateLocationDto>,
  ) {
    return this.locationsService.update(id, dto);
  }
}

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Role } from '../common/enums/role.enum';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Roles(Role.Admin, Role.Manager) @Get() findAll(
    @Query() pagination: PaginationDto,
  ) {
    return this.usersService.findAll(pagination);
  }
  @Roles(Role.Admin, Role.Manager) @Get(':id') findOne(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.findOne(id);
  }
  @Roles(Role.Admin) @Post() create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
  @Roles(Role.Admin) @Patch(':id') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto);
  }
  /** Self-service only — admins reset passwords via PATCH /users/:id with { password }. */
  @Patch(':id/password') changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() currentUser?: { id: number },
  ) {
    if (!currentUser || currentUser.id !== id)
      throw new ForbiddenException(
        'You can only change your own password here',
      );
    return this.usersService.changePassword(id, dto);
  }
}

import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Get() findAll(pagination: PaginationDto) { return this.usersService.findAll(pagination); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.usersService.findOne(id); }
  @Post() create(@Body() dto: CreateUserDto) { return this.usersService.create(dto); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) { return this.usersService.update(id, dto); }
  @Patch(':id/password') changePassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangePasswordDto, @CurrentUser() currentUser: { id: number }) {
    return this.usersService.changePassword(id === currentUser.id ? currentUser.id : id, dto);
  }
}
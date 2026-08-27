import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly usersRepository: Repository<User>) {}

  async findAll(pagination: PaginationDto): Promise<PaginatedResult<User>> {
    const [data, total] = await this.usersRepository.findAndCount({
      order: { username: 'ASC' }, skip: (pagination.page - 1) * pagination.limit, take: pagination.limit,
    });
    return { data, meta: { page: pagination.page, limit: pagination.limit, total, totalPages: Math.ceil(total / pagination.limit) } };
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.findByUsername(dto.username);
    if (existing) throw new ConflictException('Username already exists');
    const user = this.usersRepository.create({ ...dto, password: await bcrypt.hash(dto.password, 12) });
    return this.usersRepository.save(user);
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    const { password: _password, ...safeDto } = dto;
    Object.assign(user, safeDto);
    return this.usersRepository.save(user);
  }

  async changePassword(id: number, dto: ChangePasswordDto): Promise<void> {
    const user = await this.findOne(id);
    if (!(await bcrypt.compare(dto.currentPassword, user.password))) throw new UnauthorizedException('Current password is incorrect');
    user.password = await bcrypt.hash(dto.newPassword, 12);
    await this.usersRepository.save(user);
  }

  async setRefreshToken(id: number, token: string | null): Promise<void> {
    await this.usersRepository.update(id, { refreshToken: token });
  }

  async save(user: User): Promise<User> {
    return this.usersRepository.save(user);
  }
}
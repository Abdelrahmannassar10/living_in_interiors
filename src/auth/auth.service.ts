import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService, private readonly jwt: JwtService, private readonly config: ConfigService) {}

  async login(user: User) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, username: user.username, role: user.role });
    const refreshToken = await this.jwt.signAsync({ sub: user.id }, { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') });
    user.refreshToken = await bcrypt.hash(refreshToken, 12);
    user.lastLoginAt = new Date();
    await this.usersService.save(user);
    return { accessToken, refreshToken, user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role } };
  }

  async refresh(userId: number, refreshToken: string) {
    const user = await this.usersService.findOne(userId);
    if (!user.refreshToken || !(await bcrypt.compare(refreshToken, user.refreshToken))) throw new UnauthorizedException('Invalid refresh token');
    return this.login(user);
  }

  async logout(userId: number): Promise<void> { await this.usersService.setRefreshToken(userId, null); }
}
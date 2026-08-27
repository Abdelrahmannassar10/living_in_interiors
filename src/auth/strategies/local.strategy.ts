import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import * as bcrypt from 'bcrypt';
import { Strategy } from 'passport-local';
import { UsersService } from '../../users/users.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) { super({ usernameField: 'username' }); }
  async validate(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.password))) throw new UnauthorizedException('Invalid credentials');
    return user;
  }
}
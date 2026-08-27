import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Public() @UseGuards(LocalAuthGuard) @Post('login') login(@Request() request: { user: Parameters<AuthService['login']>[0] }, @Body() _dto: LoginDto) { return this.authService.login(request.user); }
  @Post('logout') logout(@Request() request: { user: { id: number } }) { return this.authService.logout(request.user.id); }
}
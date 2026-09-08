import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { IsJWT } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';

export class RefreshTokenDto {
  @IsJWT() refreshToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Public() @UseGuards(LocalAuthGuard) @Post('login') login(
    @Request() request: { user: Parameters<AuthService['login']>[0] },
  ) {
    return this.authService.login(request.user);
  }
  @Public() @Post('refresh') refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }
  @Post('logout') logout(@Request() request: { user: { id: number } }) {
    return this.authService.logout(request.user.id);
  }
}

import {
    Body,
    ConflictException,
    Controller,
    HttpCode,
    Post,
    UnauthorizedException,
  } from '@nestjs/common';
  import { AuthService } from './auth.service';
  import { DbService } from '../db/db.service';
  import { LoginDto } from './dto/login.dto';
  import { RegisterDto } from './dto/register.dto';
  
  @Controller('api/auth')
  export class AuthController {
    constructor(
      private readonly authService: AuthService,
      private readonly db: DbService,
    ) {}
  
    @Post('register')
    @HttpCode(201)
    async register(@Body() dto: RegisterDto) {
      const existing = await this.db.getUserByEmail(dto.email);
      if (existing) {
        throw new ConflictException('An account with that email already exists');
      }
  
      const passwordHash = await this.authService.hashPassword(dto.password);
      const user = await this.db.createUser(dto.email, passwordHash);
      const token = this.authService.signToken(user);
  
      return { token, user: { id: user.id, email: user.email } };
    }
  
    @Post('login')
    @HttpCode(200)
    async login(@Body() dto: LoginDto) {
      const user = await this.db.getUserByEmail(dto.email);
      if (!user) {
        throw new UnauthorizedException('Invalid email or password');
      }
  
      const valid = await this.authService.verifyPassword(dto.password, user.password_hash ?? '');
      if (!valid) {
        throw new UnauthorizedException('Invalid email or password');
      }
  
      const token = this.authService.signToken(user);
      return { token, user: { id: user.id, email: user.email } };
    }
  }
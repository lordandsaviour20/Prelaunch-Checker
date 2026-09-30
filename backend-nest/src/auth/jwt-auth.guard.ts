import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
  } from '@nestjs/common';
  import { Request } from 'express';
  import { AuthService } from './auth.service';
  
  export interface AuthedRequest extends Request {
    userId?: number | null;
  }
  
  @Injectable()
  export class JwtAuthGuard implements CanActivate {
    constructor(private readonly authService: AuthService) {}
  
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<AuthedRequest>();
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        throw new UnauthorizedException('Missing or invalid Authorization header');
      }
      const token = header.slice(7);
      try {
        const payload = this.authService.verifyToken(token);
        req.userId = payload.userId;
        return true;
      } catch {
        throw new UnauthorizedException('Invalid or expired token');
      }
    }
  }
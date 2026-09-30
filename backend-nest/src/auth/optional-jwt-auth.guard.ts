import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthedRequest } from './jwt-auth.guard';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      req.userId = null;
      return true;
    }
    const token = header.slice(7);
    try {
      const payload = this.authService.verifyToken(token);
      req.userId = payload.userId;
    } catch {
      req.userId = null;
    }
    return true;
  }
}
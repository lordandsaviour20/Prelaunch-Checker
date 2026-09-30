import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { AuthedRequest } from '../auth/jwt-auth.guard';

@Injectable()
export class CheckRateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: AuthedRequest): Promise<string> {
    return req.userId ? `user:${req.userId}` : `ip:${req.ip}`;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const res = context.switchToHttp().getResponse();
    res.status(429).json({ error: 'Too many checks submitted. Please try again later.' });
  }
}
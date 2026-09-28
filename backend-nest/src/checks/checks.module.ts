import { Module } from '@nestjs/common';
import { ChecksController } from './checks.controller';
import { ChecksService } from './checks.service';
import { SsrfGuardService } from './ssrf-guard.service';


@Module({
  controllers: [ChecksController],
  providers: [ChecksService, SsrfGuardService],
  exports: [ChecksService, SsrfGuardService],
})
export class ChecksModule {}

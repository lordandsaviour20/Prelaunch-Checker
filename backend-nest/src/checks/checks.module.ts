import { Module } from '@nestjs/common';
import { ChecksService } from './checks.service';
import { ChecksController } from './checks.controller';

@Module({
  providers: [ChecksService],
  controllers: [ChecksController]
})
export class ChecksModule {}

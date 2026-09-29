import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ChecksProcessor } from './checks.processor';
import { SITE_CHECKS_QUEUE } from './queue.constants';

@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: 'localhost', port: 6379 },
    }),
    BullModule.registerQueue({
      name: SITE_CHECKS_QUEUE,
    }),
  ],
  providers: [ChecksProcessor],
  exports: [BullModule],
})
export class QueueModule {}
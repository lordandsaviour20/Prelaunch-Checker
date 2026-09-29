import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

export const SITE_CHECKS_QUEUE = 'site-checks';

@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: 'localhost', port: 6379 },
    }),
    BullModule.registerQueue({
      name: SITE_CHECKS_QUEUE,
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
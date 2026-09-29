import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChecksModule } from './checks/checks.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [QueueModule, ChecksModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
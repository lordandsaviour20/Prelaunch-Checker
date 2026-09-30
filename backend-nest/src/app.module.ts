import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChecksModule } from './checks/checks.module';
import { QueueModule } from './queue/queue.module';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60 * 60 * 1000, // 1 hour, in ms
        limit: 50,
      },
    ]),
    QueueModule,
    ChecksModule,
    DbModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
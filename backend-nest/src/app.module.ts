import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChecksModule } from './checks/checks.module';

@Module({
  imports: [ChecksModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
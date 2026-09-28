import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ChecksService } from './checks.service';

@Controller('checks')
export class ChecksController {
  constructor(private readonly checks: ChecksService) {}

  @Get('test')
  async test(@Query('url') url: string) {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const { html, ...rest } = await this.checks.checkAccessible(normalized);
    return { url: normalized, ...rest, htmlLength: html?.length ?? 0 };
  }
}
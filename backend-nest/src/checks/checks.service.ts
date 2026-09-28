import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { AccessibleResult, Status } from './checks.types';
import { errText } from './checks.utils';

@Injectable()
export class ChecksService {
  normalizeUrl(rawUrl: unknown): string | null {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    let url = rawUrl.trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('.')) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  async checkAccessible(url: string): Promise<AccessibleResult> {
    const start = Date.now();
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: () => true,
      });
      const responseTimeMs = Date.now() - start;
      const statusCode = response.status;
      let status: Status = 'fail';
      if (statusCode >= 200 && statusCode < 300) {
        status = responseTimeMs > 3000 ? 'warning' : 'pass';
      }
      return { status, statusCode, responseTimeMs, html: response.data };
    } catch (err) {
      const responseTimeMs = Date.now() - start;
      return {
        status: 'fail',
        statusCode: null,
        responseTimeMs,
        error: errText(err),
        html: null,
      };
    }
  }
}
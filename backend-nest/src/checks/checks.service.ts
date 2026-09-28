import { Injectable } from '@nestjs/common';
import axios from 'axios';
import type { CheerioAPI } from 'cheerio';
import {
  AccessibleResult,
  ImagesAltResult,
  MetaDescriptionResult,
  Status,
  TitleResult,
  ViewportResult,
} from './checks.types';
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
  checkTitle($: CheerioAPI): TitleResult {
    const title = $('title').first().text().trim();
    if (!title) return { status: 'fail', value: '', length: 0 };
    const length = title.length;
    const status: Status = length >= 50 && length <= 60 ? 'pass' : 'warning';
    return { status, value: title, length };
  }

  checkMetaDescription($: CheerioAPI): MetaDescriptionResult {
    const desc = $('meta[name="description"]').attr('content')?.trim() || '';
    if (!desc) return { status: 'fail', value: '', length: 0 };
    const length = desc.length;
    const status: Status = length >= 150 && length <= 160 ? 'pass' : 'warning';
    return { status, value: desc, length };
  }

  checkViewport($: CheerioAPI): ViewportResult {
    const viewport = $('meta[name="viewport"]').attr('content') || '';
    if (!viewport) return { status: 'fail' };
    const status: Status = viewport.includes('width=device-width')
      ? 'pass'
      : 'warning';
    return { status, value: viewport };
  }

  checkImagesAlt($: CheerioAPI): ImagesAltResult {
    const images = $('img');
    const total = images.length;
    let missingAlt = 0;
    const missingAltList: string[] = [];
    images.each((i, el) => {
      const alt = $(el).attr('alt');
      if (!alt || !alt.trim()) {
        missingAlt++;
        const src = $(el).attr('src') || $(el).attr('data-src') || '';
        let locator: string;
        if (src) {
          const parts = src.split('/').filter(Boolean);
          locator = parts[parts.length - 1] || src;
        } else {
          locator = `image ${i + 1}`;
        }
        missingAltList.push(locator);
      }
    });
    if (total === 0) {
      return { status: 'pass', total: 0, missingAlt: 0, missingAltList: [] };
    }
    const missingRatio = missingAlt / total;
    let status: Status = 'pass';
    if (missingRatio > 0.5) status = 'fail';
    else if (missingRatio > 0) status = 'warning';
    return { status, total, missingAlt, missingAltList };
  }
}
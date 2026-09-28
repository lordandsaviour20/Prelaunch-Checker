import { Injectable } from '@nestjs/common';
import axios from 'axios';
import type { CheerioAPI } from 'cheerio';
import * as tls from 'tls';
import {
  AccessibleResult,
  BrokenLinksResult,
  ImagesAltResult,
  LinkCheckResult,
  MetaDescriptionResult,
  RobotsResult,
  SitemapResult,
  SslResult,
  Status,
  TitleResult,
  ViewportResult,
} from './checks.types';
import { errText, runWithConcurrencyLimit } from './checks.utils';

const MAX_LINKS_TO_CHECK = 40;
const CONCURRENCY = 5;

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
  async checkRobotsTxt(baseUrl: string): Promise<RobotsResult> {
    try {
      const robotsUrl = new URL('/robots.txt', baseUrl).toString();
      const response = await axios.get(robotsUrl, {
        timeout: 8000,
        validateStatus: () => true,
      });
      if (response.status === 404) {
        return { status: 'fail', reason: 'robots.txt not found' };
      }
      if (response.status !== 200) {
        return {
          status: 'warning',
          reason: `Unexpected status ${response.status}`,
        };
      }
      const content = (response.data || '').toString().trim();
      if (!content) {
        return { status: 'warning', reason: 'robots.txt is empty' };
      }
      const disallowsAll = /User-agent:\s*\*\s*\n\s*Disallow:\s*\/\s*$/im.test(
        content,
      );
      if (disallowsAll) {
        return {
          status: 'warning',
          reason: 'robots.txt disallows all crawling',
          content,
        };
      }
      return { status: 'pass', content };
    } catch (err) {
      return { status: 'fail', reason: errText(err) };
    }
  }

  async checkSitemap(
    baseUrl: string,
    robotsContent?: string,
  ): Promise<SitemapResult> {
    try {
      const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
      const response = await axios.get(sitemapUrl, {
        timeout: 8000,
        validateStatus: () => true,
      });
      if (
        response.status === 200 &&
        (response.data || '').toString().includes('<')
      ) {
        return { status: 'pass', url: sitemapUrl };
      }
    } catch {
      // ignore and fall back to robots.txt
    }
    if (robotsContent) {
      const match = robotsContent.match(/^Sitemap:\s*(\S+)/im);
      if (match) {
        return { status: 'pass', url: match[1] };
      }
    }
    return {
      status: 'fail',
      reason: 'No sitemap found at /sitemap.xml or in robots.txt',
    };
  }

  checkSSL(hostname: string): Promise<SslResult> {
    return new Promise((resolve) => {
      const socket = tls.connect(
        { host: hostname, port: 443, servername: hostname, timeout: 8000 },
        () => {
          try {
            const cert = socket.getPeerCertificate();
            socket.end();

            if (!cert || !cert.valid_to) {
              return resolve({
                status: 'fail',
                reason: 'No certificate returned',
              });
            }

            const validTo = new Date(cert.valid_to);
            const daysRemaining = Math.floor(
              (validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            );

            if (daysRemaining < 0) {
              return resolve({
                status: 'fail',
                reason: 'Certificate expired',
                validTo: cert.valid_to,
              });
            }
            if (!socket.authorized) {
              return resolve({
                status: 'fail',
                reason: String(
                  socket.authorizationError || 'Certificate not trusted',
                ),
              });
            }
            if (daysRemaining <= 30) {
              return resolve({
                status: 'warning',
                reason: `Certificate expires in ${daysRemaining} days`,
                validTo: cert.valid_to,
              });
            }

            return resolve({
              status: 'pass',
              issuer: cert.issuer?.O as string | undefined,
              validTo: cert.valid_to,
              daysRemaining,
            });
          } catch (err) {
            socket.end();
            resolve({ status: 'fail', reason: errText(err) });
          }
        },
      );

      socket.on('error', (err) =>
        resolve({ status: 'fail', reason: errText(err) }),
      );
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ status: 'fail', reason: 'Connection timed out' });
      });
    });
  }
  extractLinks($: CheerioAPI, baseUrl: string): string[] {
    const hrefs = new Set<string>();
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      if (
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('javascript:')
      ) {
        return;
      }
      try {
        const absolute = new URL(href, baseUrl).toString();
        hrefs.add(absolute);
      } catch {
        // ignore malformed hrefs
      }
    });
    return Array.from(hrefs).slice(0, MAX_LINKS_TO_CHECK);
  }

  async checkSingleLink(url: string): Promise<LinkCheckResult> {
    try {
      let response = await axios.head(url, {
        timeout: 8000,
        maxRedirects: 5,
        validateStatus: () => true,
      });

      if (response.status === 405 || response.status === 501) {
        response = await axios.get(url, {
          timeout: 8000,
          maxRedirects: 5,
          validateStatus: () => true,
        });
      }

      return { url, statusCode: response.status, ok: response.status < 400 };
    } catch (err) {
      return { url, statusCode: null, ok: false, error: errText(err) };
    }
  }

  async checkBrokenLinks(
    $: CheerioAPI,
    baseUrl: string,
  ): Promise<BrokenLinksResult> {
    const links = this.extractLinks($, baseUrl);
    if (links.length === 0) {
      return { status: 'pass', total: 0, broken: [] };
    }

    const results = await runWithConcurrencyLimit(links, CONCURRENCY, (link) =>
      this.checkSingleLink(link),
    );
    const broken = results.filter((r) => !r.ok);

    const brokenRatio = broken.length / results.length;
    let status: Status = 'pass';
    if (brokenRatio > 0.2) status = 'fail';
    else if (brokenRatio > 0) status = 'warning';

    return {
      status,
      total: results.length,
      broken: broken.map((b) => ({
        url: b.url,
        statusCode: b.statusCode,
        error: b.error,
      })),
    };
  }
}
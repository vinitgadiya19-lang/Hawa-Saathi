import type { NextFunction, Request, Response } from 'express';

/**
 * Security headers applied to all server responses.
 * CSP allows Google Fonts and Open-Meteo APIs while blocking untrusted scripts/objects.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://geocoding-api.open-meteo.com https://air-quality-api.open-meteo.com",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self)'
  );
  next();
}

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  now?: () => number;
}

interface BucketRecord {
  count: number;
  resetAt: number;
}

/**
 * Lightweight in-memory fixed-window rate limiter per client IP for /api/* routes.
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const maxRequests = options.maxRequests ?? 60;
  const nowFn = options.now ?? (() => Date.now());
  const buckets = new Map<string, BucketRecord>();

  const pruneExpired = (now: number) => {
    if (buckets.size < 500) return;
    for (const [key, entry] of buckets.entries()) {
      if (now >= entry.resetAt) {
        buckets.delete(key);
      }
    }
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = nowFn();
    pruneExpired(now);

    const ip =
      (typeof req.ip === 'string' && req.ip) ||
      req.socket?.remoteAddress ||
      'unknown';

    const existing = buckets.get(ip);
    if (!existing || now >= existing.resetAt) {
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - 1)));
      next();
      return;
    }

    if (existing.count >= maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
        code: 'RATE_LIMITED',
      });
      return;
    }

    existing.count += 1;
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, maxRequests - existing.count))
    );
    next();
  };
}

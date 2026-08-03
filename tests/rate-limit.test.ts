import { beforeEach, describe, expect, it } from 'vitest';
import { clientIp, rateLimit, resetRateLimits } from '@/lib/api/rate-limit';

beforeEach(() => {
  resetRateLimits();
});

describe('حدّ المعدّل — نافذة منزلقة', () => {
  it('يسمح حتى الحدّ ثم يمنع', () => {
    const now = 1_000_000;
    for (let i = 0; i < 60; i += 1) {
      expect(rateLimit('ip:1', 60, 60, now).allowed, `المحاولة ${String(i + 1)}`).toBe(true);
    }
    const blocked = rateLimit('ip:1', 60, 60, now);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBe(60);
  });

  it('والنافذة تنزلق — بعد انقضائها يُسمح ثانيةً', () => {
    const now = 1_000_000;
    for (let i = 0; i < 60; i += 1) rateLimit('ip:2', 60, 60, now);
    expect(rateLimit('ip:2', 60, 60, now).allowed).toBe(false);
    // بعد دقيقة
    expect(rateLimit('ip:2', 60, 60, now + 60_001).allowed).toBe(true);
  });

  it('والمفاتيح مستقلّة — عنوانٌ لا يحجب غيره', () => {
    const now = 1_000_000;
    for (let i = 0; i < 60; i += 1) rateLimit('ip:3', 60, 60, now);
    expect(rateLimit('ip:3', 60, 60, now).allowed).toBe(false);
    expect(rateLimit('ip:4', 60, 60, now).allowed).toBe(true);
  });
});

describe('عنوان الطالب', () => {
  it('أوّل عنوان في x-forwarded-for هو الأبعد — وهو المقصود', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' });
    expect(clientIp(headers)).toBe('203.0.113.9');
  });

  it('ويسقط إلى x-real-ip ثم إلى مجهول', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientIp(new Headers())).toBe('unknown');
    // ترويسة فارغة لا تُقرأ عنوانًا
    expect(clientIp(new Headers({ 'x-forwarded-for': '' }))).toBe('unknown');
  });
});

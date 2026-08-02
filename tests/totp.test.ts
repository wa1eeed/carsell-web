import { describe, expect, it } from 'vitest';
import {
  TOTP_STEP_SECONDS,
  fromBase32,
  generateSecret,
  toBase32,
  totp,
  totpUri,
  verifyTotp,
} from '@/lib/auth/totp';

/**
 * متجهات RFC 6238 الرسمية (الملحق ب).
 * السرّ `12345678901234567890` بترميز Base32، والخوارزمية SHA-1.
 * هذه هي الشهادة على التنفيذ — لا التوثيق ولا الثقة بتبعية.
 */
const RFC_SECRET = toBase32(Buffer.from('12345678901234567890', 'ascii'));

const RFC_VECTORS: readonly [number, string][] = [
  [59, '287082'],
  [1_111_111_109, '081804'],
  [1_111_111_111, '050471'],
  [1_234_567_890, '005924'],
  [2_000_000_000, '279037'],
  [20_000_000_000, '353130'],
];

describe('TOTP — متجهات RFC 6238', () => {
  it.each(RFC_VECTORS)('عند t=%i يعطي %s', (seconds, expected) => {
    expect(totp(RFC_SECRET, new Date(seconds * 1000))).toBe(expected);
  });
});

describe('Base32', () => {
  it('الترميز وفكّه دورة مغلقة', () => {
    for (const text of ['a', 'ab', 'abc', 'abcd', 'abcde', '12345678901234567890']) {
      const buffer = Buffer.from(text, 'ascii');
      expect(fromBase32(toBase32(buffer)).toString('ascii'), text).toBe(text);
    }
  });

  it('يرفض محرفًا خارج الأبجدية', () => {
    expect(() => fromBase32('ABC1')).toThrow();
  });
});

describe('التحقّق', () => {
  const secret = generateSecret();
  const now = new Date('2026-08-02T09:00:00.000Z');

  it('الرمز الحالي يُقبل', () => {
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true);
  });

  it('خطوة قبل وبعد مقبولتان — الساعة المنحرفة بثوانٍ لا تُرفض', () => {
    const before = new Date(now.getTime() - TOTP_STEP_SECONDS * 1000);
    const after = new Date(now.getTime() + TOTP_STEP_SECONDS * 1000);
    expect(verifyTotp(secret, totp(secret, before), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, after), now)).toBe(true);
  });

  it('خطوتان خارج النافذة مرفوضتان', () => {
    const far = new Date(now.getTime() + 2 * TOTP_STEP_SECONDS * 1000);
    expect(verifyTotp(secret, totp(secret, far), now)).toBe(false);
  });

  it('يرفض ما ليس ست خانات', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 56', '١٢٣٤٥٦']) {
      expect(verifyTotp(secret, bad, now), bad).toBe(false);
    }
  });

  it('سرّ آخر لا يفتح', () => {
    expect(verifyTotp(generateSecret(), totp(secret, now), now)).toBe(false);
  });
});

describe('رابط التسجيل', () => {
  it('يحمل السرّ والمصدر والخوارزمية', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'ops@carsell.one');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});

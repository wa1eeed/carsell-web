import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP — RFC 6238 على HOTP (RFC 4226).
 *
 * منفَّذ من `node:crypto` لا من مكتبة: الخوارزمية ثلاثون سطرًا
 * ولها **متجهات اختبار رسمية** في RFC 6238، فالتحقّق منها أقوى
 * من الوثوق بتبعية — والاختبار يشهد لا التوثيق.
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/**
 * نافذة التسامح: خطوة واحدة قبل وبعد (٣٠ ثانية في كل اتجاه).
 * أوسع من ذلك يوسّع نافذة إعادة التشغيل بلا مبرّر، وأضيق يرفض
 * ساعةً منحرفة بثوانٍ — وهي الحالة الشائعة على الهواتف.
 */
export const TOTP_WINDOW = 1;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(bytes = 20): string {
  return toBase32(randomBytes(bytes));
}

export function toBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function fromBase32(secret: string): Buffer {
  const clean = secret.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error(`محرف Base32 غير صالح: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP — RFC 4226 §5.3، الاقتطاع الديناميكي. */
function hotp(key: Buffer, counter: number, digits: number, algorithm: string): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac(algorithm, key).update(buffer).digest();
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totp(
  secret: string,
  at: Date = new Date(),
  { digits = TOTP_DIGITS, step = TOTP_STEP_SECONDS, algorithm = 'sha1' } = {},
): string {
  const counter = Math.floor(at.getTime() / 1000 / step);
  return hotp(fromBase32(secret), counter, digits, algorithm);
}

/**
 * تحقّق ثابت الزمن ضمن نافذة التسامح.
 * المقارنة `timingSafeEqual` لا `===` — الفرق مقيس ويكشف الرمز حرفًا حرفًا.
 */
export function verifyTotp(
  secret: string,
  code: string,
  at: Date = new Date(),
  window = TOTP_WINDOW,
): boolean {
  const candidate = code.replace(/\s+/g, '');
  if (!/^\d+$/.test(candidate) || candidate.length !== TOTP_DIGITS) return false;

  const key = fromBase32(secret);
  const counter = Math.floor(at.getTime() / 1000 / TOTP_STEP_SECONDS);
  const given = Buffer.from(candidate);

  for (let drift = -window; drift <= window; drift += 1) {
    const expected = Buffer.from(hotp(key, counter + drift, TOTP_DIGITS, 'sha1'));
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return true;
    }
  }
  return false;
}

/** رابط `otpauth://` لتطبيق المصادقة. */
export function totpUri(secret: string, email: string, issuer = 'CarSell Admin'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

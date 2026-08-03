import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * تحقّق HMAC من توقيع الويبهوك — **بمقارنة ثابتة الزمن**.
 *
 * المقارنة بـ`===` تفشل عند أوّل بايت مختلف، وفرقُ التوقيت بين محاولةٍ
 * وأخرى يكشف التوقيع الصحيح حرفًا حرفًا. والفرق ميكروثوانٍ — وهو كافٍ.
 *
 * وهو خارج المُهايئات عمدًا: التحقّق واحد عند كل بوابة، والمُهايئ
 * يمرّر سرّه وحده.
 */
export function verifyHmac(rawBody: string, signature: string, secret: string): boolean {
  if (signature === '' || secret === '') return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }

  // `timingSafeEqual` ترمي على اختلاف الطول — والطول ليس سرًّا
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

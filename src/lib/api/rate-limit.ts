/**
 * حدّ معدّل في الذاكرة — **نافذة منزلقة لكل مفتاح**.
 *
 * وحدوده مُعلنة لا مخفيّة:
 *   · **لكل نسخة** لا للمنصّة: نسختان تعنيان ضِعف الحدّ.
 *   · **يضيع عند إعادة التشغيل**.
 *
 * فهو **مانع إزعاج لا حدّ أمان**: يجعل تخمينًا يحتاج آلاف المحاولات
 * غير عمليّ، ولا يُبنى عليه منع اقتحام. وحدٌّ حقيقيّ يحتاج Redis —
 * وهو موجود للبثّ الحيّ، ويُنقل إليه حين يصير الحدّ حرسًا لا إزعاجًا.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** تنظيف كسول — لا مؤقّت دوريّ يبقى حيًّا بلا حاجة. */
function sweep(now: number): void {
  if (windows.size < 1000) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export type RateVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  now: number = Date.now(),
): RateVerdict {
  sweep(now);
  const existing = windows.get(key);

  if (existing === undefined || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { allowed: true };
}

/** للاختبار وحده — لا يُستدعى في مسار حيّ. */
export function resetRateLimits(): void {
  windows.clear();
}

/**
 * عنوان الطالب من ترويسات الوكيل.
 *
 * وأوّل عنوان في `x-forwarded-for` هو الأبعد — وهو ما نريد: الوكلاء
 * بيننا وبينه يضيفون أنفسهم إلى آخر القائمة.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded !== null && forwarded !== '') {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  return headers.get('x-real-ip') ?? 'unknown';
}

import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, staticSecurityHeaders } from '@/lib/security/headers';

/**
 * ═══ رؤوس الأمان ═══
 *
 * العطل الذي وُلد منه هذا الملف: **لم يكن في المنصّة رأسٌ واحد.** سوقٌ
 * يحمل مدفوعاتٍ وأرقام هويّات وحساب ضمان كان يُخدَم بلا `nosniff` ولا
 * `CSP` ولا منعِ تأطير — ولا اختبارٌ يسأل عنها، لأنها ليست سلوكًا
 * يُرى في شاشة.
 *
 * **ورأسٌ يسقط لا يُرى**: الصفحة تعمل كما كانت، والحماية وحدها تذهب.
 */

function headerMap(): Map<string, string> {
  return new Map(staticSecurityHeaders().map((h) => [h.key, h.value]));
}

describe('الرؤوس الثابتة', () => {
  it('تحمل الأساسيات التي لا خلاف عليها', () => {
    const headers = headerMap();

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(headers.has('Permissions-Policy')).toBe(true);
  });

  /**
   * **وHSTS لا تُرسَل من التطوير.** المتصفّح يحفظها للنطاق كلّه
   * بمدّتها، فتُعطِّل `http://localhost` على كل مشروعٍ آخر للمطوّر —
   * وإبطالها يحتاج إعدادًا داخليًّا في المتصفّح لا مسحَ ذاكرة.
   *
   * والاختبار يعمل بـ`APP_ENV=development`، فغيابُها هو المتوقَّع.
   */
  it('لا HSTS خارج الإنتاج', () => {
    expect(headerMap().has('Strict-Transport-Security')).toBe(false);
  });
});

describe('سياسة المحتوى', () => {
  const policy = contentSecurityPolicy('abc123');

  it('تحمل الـnonce ولا تسمح بنصٍّ داخليّ مفتوح', () => {
    expect(policy).toContain("'nonce-abc123'");

    /**
     * **`'unsafe-inline'` في النصوص تُبطل السياسة كلّها**: نصٌّ
     * يُحقَن في صفحةٍ تسمح به يُنفَّذ — وهو ما تمنعه السياسة أصلًا.
     * (وهي مسموحةٌ للأنماط: نمطٌ لا ينفّذ شيئًا، و`next` يحقنها.)
     */
    const scripts = policy.split('; ').find((part) => part.startsWith('script-src'));
    expect(scripts).toBeDefined();
    expect(scripts).not.toContain("'unsafe-inline'");
  });

  it('تمنع التأطير وتقييد القاعدة والكائنات', () => {
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("form-action 'self'");
  });

  /**
   * **ولا مصدر خارجيّ.** المنتج لا يحمّل خطًّا ولا نصًّا من نطاق
   * آخر — فأيّ `https://` يظهر في السياسة بابٌ فُتح، ويستحقّ قرارًا
   * مكتوبًا لا سطرًا يمرّ في مراجعة.
   */
  it('لا نطاق خارجيّ في السياسة', () => {
    expect(policy).not.toMatch(/https?:\/\//);
  });
});

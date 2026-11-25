import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminCookieOptions } from '@/lib/auth/admin-session';
import { dealerCookieOptions } from '@/lib/auth/dealer-session';

/**
 * ═══ كوكي اللوحة يبلغ مساراتها ═══
 *
 * **ومسارُ الكوكي يُطابَق بالبادئة.** كان كوكي المعرض على
 * `path: '/dealer'` — تضييقًا مقصودًا — **فلم يبلغ
 * `/api/v1/dealer/...`**، وردّت مساراتُ اللوحة كلُّها ٤٠١: الدعوة
 * والتصدير وقرار المزاد وحفظ الملفّ والاستيراد والردود.
 *
 * **والصفحاتُ كانت تعمل**، فبدا كلُّ شيء سليمًا: مكوّنُ الخادم يقرأ
 * الكوكي مباشرةً. فالعطلُ في الكتابة وحدها، ولا يظهر إلّا بالضغط —
 * وكشفَه النقر.
 */
const ROOT = join(import.meta.dirname, '..');

describe('كوكي اللوحات', () => {
  it('وكوكي المعرض يبلغ مسارات اللوحة ومساراتها البرمجية', () => {
    const options = dealerCookieOptions(3600);
    const path = options.path;

    /** كلُّ مسارٍ تناديه اللوحة — وبادئةُ الكوكي تسبقه أو لا يبلغه. */
    for (const route of ['/dealer', '/dealer/orders', '/api/v1/dealer/replies']) {
      expect(route.startsWith(path), `${path} لا يبلغ ${route}`).toBe(true);
    }
  });

  it('ولوحة الأدمن مثلها', () => {
    const path = adminCookieOptions(3600).path;
    for (const route of ['/admin', '/api/v1/admin/x']) {
      expect(route.startsWith(path), `${path} لا يبلغ ${route}`).toBe(true);
    }
  });

  it('وكل لوحة تبقى على sameSite=strict و httpOnly', () => {
    for (const options of [dealerCookieOptions(3600), adminCookieOptions(3600)]) {
      expect(options.sameSite).toBe('strict');
      expect(options.httpOnly).toBe(true);
    }
  });

  it('ولا مسار برمجي للوحة المعرض خارج /api/v1/dealer', () => {
    /**
     * **والبادئةُ وعدٌ**: مسارٌ للوحة يُكتب خارجها يخرج من تحت
     * الكوكي بلا أن يشكو أحد — فيردّ ٤٠١ في الإنتاج وحده.
     */
    const shell = readFileSync(join(ROOT, 'src/components/dealer/DealerShell.tsx'), 'utf8');
    for (const match of shell.matchAll(/href:\s*'([^']+)'/g)) {
      expect(match[1]?.startsWith('/dealer')).toBe(true);
    }
  });
});

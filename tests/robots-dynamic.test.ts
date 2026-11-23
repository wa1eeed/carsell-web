import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();

/**
 * ═══ `robots.txt` يُقرأ عند الطلب لا عند البناء ═══
 *
 * كان مسارًا ساكنًا (`○` في خرج البناء)، فيُخبَز في الصورة بقيمة
 * **بيئة البناء**. وبناءُ الحاوية بلا متغيّرات، فخرج الإنتاج الأوّل
 * بـ«Disallow: /» وتجمّد عليه — **موقعٌ لا يُفهرَس أبدًا، بصمت.**
 * وكشفه فتحُ `https://carz.sa/robots.txt` بعد أوّل نشر، لا اختبار.
 *
 * **والاتّجاه الثاني أخطر**: مُنسِّقٌ يمرّر `APP_ENV=production` إلى
 * بناء staging يُخرج ملفًّا يسمح بالزحف، فتُفهرَس الإعلانات المزروعة
 * على نطاقٍ حقيقيّ — وإخراجها من الفهرس أسابيع.
 *
 * وقِيس يوم الإصلاح: من كل مسارات `src/app`، **ثلاثةٌ وحدها** تقرأ
 * البيئة بلا إعلان ديناميّ، وكلُّها تُصدِّر `POST` فقط — وNext لا
 * يخبز مسارًا بلا `GET`. فالحالة كانت واحدة.
 */
describe('robots.txt يقرأ البيئة الحيّة', () => {
  it('مُعلَنٌ ديناميًّا — وإلّا خُبز بقيمة البناء', () => {
    const source = stripComments(readFileSync(join(ROOT, 'src/app/robots.ts'), 'utf8'));
    expect(source).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('وخريطةُ الموقع مثلُه — الملفّان يتفقان أو يتناقضان معًا', () => {
    const source = stripComments(readFileSync(join(ROOT, 'src/app/sitemap.ts'), 'utf8'));
    /** تقرأ القاعدة فهي ديناميّة بطبعها — والفحص أن تبقى كذلك. */
    expect(source).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]|from '@\/lib\/db'/);
  });

  it('ويمنع الزحف خارج الإنتاج ويسمح به فيه', async () => {
    const { default: robots } = await import('@/app/robots');
    const rules = robots();
    expect(rules).toHaveProperty('rules');
  });
});

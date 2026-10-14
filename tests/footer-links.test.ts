import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * ═══ روابطُ التذييل تفتح صفحات ═══
 *
 * قِيس بالنقر: أحد عشر سطرًا في التذييل تُصيَّر `<li>{link}</li>` **بلا
 * `href`** — «الشروط والأحكام» و«سياسة الخصوصية» تُعرضان ولا تُفتحان،
 * وهما ممّا يجب أن يبلغه الزائر من أي صفحة.
 *
 * وثلاثةٌ منها كانت أسماءً بلا مسارات أصلًا («التمويل» · «دليل البائع»
 * · «الباقات») — **ورابطٌ يفتح ٤٠٤ أسوأ من غيابه**، فحُذفت حتى تُبنى.
 *
 * **والفحص على الملفّات لا على الشبكة**: اختبارٌ ينادي خادمًا يحتاج
 * خادمًا يعمل، وهذا يقرأ شجرة المسارات — فيسقط في CI كما يسقط هنا.
 */

type Column = { title: string; links: { label: string; href: string }[] };

function footer(locale: 'ar' | 'en'): Column[] {
  const messages = JSON.parse(
    readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), 'utf8'),
  ) as { site: { footer: Record<string, Column> } };
  return Object.values(messages.site.footer);
}

/**
 * أثمّة صفحةٌ لهذا المسار؟
 *
 * والمسارات الديناميكية تُطابَق بقطعةٍ واحدة: `/legal/terms` تخدمها
 * `legal/[key]/page.tsx`، فوجودُ المجلّد الحرفيّ ليس شرطًا.
 */
function routeExists(href: string): boolean {
  const parts = href.split('/').filter((part) => part !== '');
  const base = new URL('../src/app/[locale]/(site)/', import.meta.url).pathname;

  const walk = (dir: string, rest: readonly string[]): boolean => {
    if (rest.length === 0) return existsSync(`${dir}page.tsx`);
    const [head, ...tail] = rest;
    if (existsSync(`${dir}${String(head)}/`)) return walk(`${dir}${String(head)}/`, tail);

    /** قطعةٌ ديناميكية تقبل أي قيمة — ويكفي أن تكون واحدةٌ منها */
    const dynamic = readdirSync(dir, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory() && entry.name.startsWith('['),
    );
    return dynamic.some((entry) => walk(`${dir}${entry.name}/`, tail));
  };

  return walk(base, parts);
}

describe('تذييل الموقع', () => {
  it('كلُّ رابطٍ فيه يفتح صفحةً قائمة', () => {
    for (const locale of ['ar', 'en'] as const) {
      for (const column of footer(locale)) {
        for (const link of column.links) {
          expect(link.href.startsWith('/'), `${locale}: ${link.href}`).toBe(true);
          expect(routeExists(link.href), `${locale}: ${link.label} → ${link.href}`).toBe(true);
        }
      }
    }
  });

  /** **واللغتان تحملان الوجهات نفسها** — وإلّا وصل زائرُ إحداهما أقلّ. */
  it('واللغتان تتطابقان في الوجهات', () => {
    const hrefs = (locale: 'ar' | 'en'): string[] =>
      footer(locale).flatMap((column) => column.links.map((link) => link.href));
    expect(hrefs('en')).toEqual(hrefs('ar'));
  });

  /**
   * **والشروط والخصوصية فيه حتمًا.** هما ممّا يجب أن يبلغه الزائر من
   * أي صفحة، والتذييل هو الموضع الوحيد الذي يصل كل صفحة.
   */
  it('وفيه الشروط وسياسة الخصوصية', () => {
    const hrefs = footer('ar').flatMap((column) => column.links.map((link) => link.href));
    expect(hrefs).toContain('/legal/terms');
    expect(hrefs).toContain('/legal/privacy');
  });
});

/**
 * ═══ ويصل كلَّ صفحةٍ عامّة ═══
 *
 * قِيس: كان يُصيَّر في الرئيسية وحدها من ثلاثٍ وثلاثين صفحة. وسببُه أنه
 * يأخذ أعمدته خاصّيةً، فكانت كل صفحةٍ تريده تنسخ خمسة أسطر — فلم
 * تنسخها إلّا واحدة. ومجموعةُ `(site)` تضعه تحت الجميع.
 */
describe('موضع التذييل', () => {
  it('في تخطيط المجموعة لا في صفحةٍ بعينها', () => {
    const layout = readFileSync(
      new URL('../src/app/[locale]/(site)/layout.tsx', import.meta.url),
      'utf8',
    );
    expect(layout).toContain('SiteFooter');
  });

  /** **ولا يُصيَّر مرّتين**: صفحةٌ تضعه بنفسها تُظهره تحت تخطيطها. */
  it('ولا تضعه صفحةٌ بنفسها', () => {
    const home = readFileSync(
      new URL('../src/app/[locale]/(site)/page.tsx', import.meta.url),
      'utf8',
    );
    expect(home).not.toContain('<SiteFooter');
  });
});

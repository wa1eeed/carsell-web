import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cn } from '@/lib/cn';

const ROOT = process.cwd();

/**
 * ═══ `cn` يضمّ ولا يدمج — والتعليقُ كان يقول غيرَ ذلك ═══
 *
 * قال «آخر صنف يفوز كما في CSS»، **وهو غيرُ صحيح**: الدالّة تصفّ
 * النصوص، ومن يقرّر الفائز بين صنفين يضبطان الخاصّية نفسَها هو
 * ترتيبُ تيلويند في ملفّه المولَّد. وقِيس في المتصفّح:
 * `inline-flex hidden` و`hidden inline-flex` كلتاهما `inline-flex`.
 *
 * فمن قرأ التعليق صدّقه، ومرّر `hidden` إلى زرٍّ فلم يُخفَ.
 */
describe('cn يضم ولا يدمج', () => {
  it('يحفظ الترتيب ولا يحذف المتصادم', () => {
    /** **وهذا توثيقُ السلوك لا إقرارٌ بصحّته** — الصنفان يبقيان. */
    expect(cn('inline-flex', 'hidden')).toBe('inline-flex hidden');
    expect(cn('px-4.5', 'px-9')).toBe('px-4.5 px-9');
  });

  it('ويسقط الفارغ والمعدوم', () => {
    expect(cn('a', '', null, undefined, false, 'b')).toBe('a b');
  });

  /** **والتعليقُ لا يَعِد بالدمج** — وعدٌ كاذبٌ أسوأ من غيابه. */
  it('ولا يعد تعليقه بما لا يفعل', () => {
    const source = readFileSync(join(ROOT, 'src/lib/cn.ts'), 'utf8');
    expect(source).not.toContain('فآخر صنف يفوز كما في CSS');
    expect(source).toContain('ولا يدمجها');
  });
});

/**
 * ═══ والإخفاءُ على الغلاف لا على الزرّ ═══
 *
 * `className="hidden sm:inline-flex"` على `LinkButton` **لا يُخفيه**:
 * `inline-flex` في أساس الزرّ تغلب `hidden` في الترتيبين. وأثرُه
 * مرئيّ — زرُّ «بع سيارتك» يظهر على ٣٧٥px للزائر غير المسجَّل وقد
 * أُريد إخفاؤه ليتّسع الشريط.
 */
describe('غلبةُ صنفٍ على أساس مكون تقع على غلاف', () => {
  it('لا زر ولا رابط زر يحمل hidden في صنفه', () => {
    const offenders: string[] = [];
    const files = [
      'src/components/site/AccountNav.tsx',
      'src/components/site/SiteHeader.tsx',
      'src/components/site/MobileNav.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      /** `<LinkButton … className="… hidden …">` أو `<Button …>` مثله. */
      const pattern = /<(?:Link)?Button[^>]*className=(?:"|\{[^}]*')[^"'}]*\bhidden\b/g;
      for (const match of source.matchAll(pattern)) offenders.push(`${file}: ${match[0].slice(0, 60)}`);
    }
    expect(offenders).toEqual([]);
  });

  /** **والغلافُ موجود** — فالنيّة محفوظة لا محذوفة. */
  it('والغلاف يحمل الإخفاء بدلا منه', () => {
    const source = readFileSync(join(ROOT, 'src/components/site/AccountNav.tsx'), 'utf8');
    expect(source).toContain('<span className="hidden sm:inline-flex">');
  });
});

/** **والقياسُ دائم** — الماشي يعدّ التصادمات في كل زحفة. */
describe('الماشي يقيس التصادم', () => {
  it('يحمل فاحص الخاصيات ويطبع عدده', () => {
    const walker = readFileSync(join(ROOT, 'scripts/walk-surface.ts'), 'utf8');
    expect(walker).toContain('function classClashes');
    expect(walker).toContain('tailwindProperty');
    expect(walker).toContain('صنفان لخاصّيةٍ واحدة');
  });
});

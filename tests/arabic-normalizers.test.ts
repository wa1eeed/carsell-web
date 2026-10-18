import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeArabic, CITY_SLUG_NORMALIZED } from '@/lib/labels/cities';
import { normalize } from '@/lib/search/lexicon';

/**
 * ═══ المطبِّعان — **ولم يكن لهما اختبار** ═══
 *
 * `normalizeArabic` في المدن و`normalize` في المعجم يحذفان التشكيل
 * ليُطابقا ما يكتبه الناس. وكانت فئتا التشكيل فيهما **مكتوبتين
 * بالعلامات نفسها** (`/[ً-ْـ]/`) — فأوّلُ مسحٍ آليّ للتشكيل في
 * المستودع يُحوّلهما إلى `[-ـ]` بلا شكوى من مُصرِّف ولا لينت،
 * فيتوقّف التطبيع صامتًا ولا شيء يسأل.
 *
 * فصارتا بالمهارب (`ً-ْ`)، وهذا الاختبار يسأل.
 */
describe('تطبيعُ العربية يحذف التشكيل', () => {
  /** الكلمة نفسها مشكولةً وغيرَ مشكولة تُطبَّع إلى واحدة. */
  const pairs: readonly [string, string][] = [
    ['الرِّياض', 'الرياض'],
    ['جُدّة', 'جده'],
    ['مكَّة المكرَّمة', 'مكه المكرمه'],
  ];

  it('normalizeArabic — المدن', () => {
    for (const [voweled, plain] of pairs) {
      expect(normalizeArabic(voweled)).toBe(normalizeArabic(plain));
    }
    /** والتطويل يُحذف معها — «الريــاض» و«الرياض» مدينةٌ واحدة. */
    expect(normalizeArabic('الريـــاض')).toBe(normalizeArabic('الرياض'));
  });

  it('normalize — المعجم', () => {
    for (const [voweled, plain] of pairs) {
      expect(normalize(voweled)).toBe(normalize(plain));
    }
    expect(normalize('كامــري')).toBe(normalize('كامري'));
  });

  /** ومدينةٌ مشكولةٌ تُفضي إلى مقطعها — وهو ما يبني الرابط. */
  it('والمقطع يُصاب من المشكول', () => {
    expect(CITY_SLUG_NORMALIZED[normalizeArabic('الرِّياض')]).toBe('riyadh');
  });

  /**
   * **والفئة بمهاربها لا بحروفها.** لو عادت مكتوبةً بالعلامات لمرّت
   * الاختباراتُ أعلاه (ما دامت الفئة سليمة) — وسقطت في أوّل مسح.
   * فهذا يفحص الشكل نفسه.
   */
  it('وفئتا التشكيل مكتوبتان بالمهارب', () => {
    for (const file of ['src/lib/labels/cities.ts', 'src/lib/search/lexicon.ts']) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).toContain('\\u064B-\\u0652');
      /** ولا علامةَ تشكيلٍ حرفيّة داخل أي فئة نمطية في الملفّين. */
      const classes = source.match(/\[[^\]\n]*\]/g) ?? [];
      for (const cls of classes) {
        expect(/[ً-ْٰ]/.test(cls)).toBe(false);
      }
    }
  });
});

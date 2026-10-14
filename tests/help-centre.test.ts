import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { helpCategories, helpFaqs } from '@/lib/domain/content';

/**
 * ═══ مركز المساعدة — Wn ═══
 *
 * **العدّاد يُحسب بمرشّح القائمة التي يفتحها.** كان `helpCategories`
 * يعدّ كل سؤالٍ فعّال و`helpFaqs` تعرض ما وُضع على سطح `help_center`
 * وحده — فقِيس على بيانات التطوير: **أربعةٌ من تسعة تكذب**، و«المزادات
 * ٥ مقالات» تفتح ثلاثًا. ولا يراه القارئ عدّادًا خاطئًا بل يظنّ أن
 * شيئًا ضاع.
 *
 * ولا يُفحص برقمٍ مكتوب هنا: المحرّر يضيف ويحذف، ورقمٌ ثابت في اختبار
 * يسقط على تحريرٍ صحيح. فالفحص **علاقةٌ** — كل عدّاد يساوي طول قائمته.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('عدّادات المواضيع', () => {
  it('كلُّ عدّادٍ يساوي عدد ما يفتحه', async () => {
    const categories = await helpCategories();
    expect(categories.length).toBeGreaterThan(0);

    for (const category of categories) {
      /** الحدّ أوسع من أي موضوع — فالمقارنة على الكلّ لا على صفحة. */
      const rows = await helpFaqs(category.key, 200);
      expect(rows.length, `الموضوع «${category.key}»`).toBe(category.count);
    }
  });

  it('ولا يُعرض موضوعٌ بلا مقالة', async () => {
    const categories = await helpCategories();
    expect(categories.every((category) => category.count > 0)).toBe(true);
  });

  /**
   * **والمواضيع تُشتقّ من الأسئلة لا من قائمةٍ مكتوبة.** موضوعٌ أُفرغ
   * يختفي، وجديدٌ يظهر بمجرّد أن يُصنَّف فيه سؤالٌ معروض — وقائمةٌ في
   * الشيفرة تعني موضوعًا فارغًا ينتظر محرّرًا لا يعلم بوجوده.
   */
  it('والمواضيع مشتقّةٌ ممّا يُعرض فعلًا', async () => {
    const categories = await helpCategories();
    const shown = await helpFaqs(undefined, 500);
    expect(new Set(categories.map((category) => category.key))).toEqual(
      new Set(shown.map((faq) => faq.category)),
    );
  });
});

describe('البحث', () => {
  /**
   * **ويقع في الجواب كما في السؤال.** من يبحث لا يعرف كيف صاغ المحرّر
   * العنوان: يكتب كلمةً من الجواب ويريده.
   */
  it('يجد كلمةً لا توجد إلا في نصّ الجواب', async () => {
    const all = await helpFaqs(undefined, 200);
    const hidden = all.find((faq) => {
      const words = faq.answerAr.split(/\s+/).filter((word) => word.length > 5);
      return words.some((word) => !faq.questionAr.includes(word));
    });
    expect(hidden).toBeDefined();
    if (hidden === undefined) return;

    const word = hidden.answerAr
      .split(/\s+/)
      .filter((part) => part.length > 5)
      .find((part) => !hidden.questionAr.includes(part));
    expect(word).toBeDefined();
    if (word === undefined) return;

    const found = await helpFaqs(undefined, 200, word.replace(/[^ء-ي]/g, ''));
    expect(found.some((faq) => faq.id === hidden.id)).toBe(true);
  });

  it('وكلمةٌ لا وجود لها تُعيد لا شيء — فالشاشة تقول «لا نتائج» لا «لا أسئلة في هذا الموضوع»', async () => {
    const found = await helpFaqs(undefined, 200, 'zzzqqqxxx');
    expect(found).toHaveLength(0);
  });
});

/**
 * ═══ ونصوصُ الشاشة موجودة في اللغتين ═══
 *
 * مفتاحٌ ناقص في `en.json` يُصيَّر مفتاحًا عاريًا على الشاشة، ولا
 * يكشفه نوعٌ ولا تشغيلٌ بالعربية.
 */
describe('نصوص مركز المساعدة', () => {
  const keys = [
    'heroTitle', 'intro', 'resultsFor', 'clearSearch',
    'emptySearch', 'emptySearchBody', 'allTopics', 'contact',
    'searchPlaceholder', 'searchSubmit',
  ];

  it('كلُّ مفتاحٍ تستعمله الصفحة موجودٌ في العربية والإنجليزية', () => {
    for (const locale of ['ar', 'en'] as const) {
      const messages = JSON.parse(
        readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), 'utf8'),
      ) as { help: Record<string, string>; units: Record<string, string> };
      for (const key of keys) {
        expect(messages.help[key], `${locale}.help.${key}`).toBeTruthy();
      }
      expect(messages.units.results, `${locale}.units.results`).toBeTruthy();
    }
  });

  /**
   * **والمقدّمة لا تَعِد بموضع.** كانت تقول «تواصل معنا من أسفل
   * الصفحة» وبطاقةُ التواصل في العمود الجانبيّ — فمن قرأها نزل إلى
   * التذييل ولم يجد. والنصّ المعروض وعدٌ لا وصف.
   */
  it('ولا تَعِد المقدّمة بموضعٍ على الشاشة', () => {
    const ar = JSON.parse(
      readFileSync(new URL('../src/messages/ar.json', import.meta.url), 'utf8'),
    ) as { help: Record<string, string> };
    expect(ar.help.intro).not.toContain('أسفل الصفحة');
  });
});

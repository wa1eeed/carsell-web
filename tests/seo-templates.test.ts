import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { ADMIN_NAV } from '@/components/admin/nav';
import { adminSeoTemplates, seoTemplate, updateSeoTemplate } from '@/lib/domain/seo';
import { landingSeoValues, seoCopy } from '@/lib/seo/copy';
import {
  SEO_SURFACES,
  SEO_VARIABLES,
  countBeforeNoun,
  renderSeo,
  seoPlaceholders,
  unknownPlaceholders,
} from '@/lib/seo/templates';
import { SEO_SAMPLE, SEO_SURFACE_LABEL, SEO_VARIABLE_LABEL } from '@/lib/labels/seo';
import { landingCombinations, landingContent } from '@/lib/domain/landing';

const ROOT = process.cwd();
const admin = { id: 'test-admin-seo' };

/**
 * **والاختبار يعيد ما غيّره** — والصفوف مزروعة بترحيل لا مصنوعة هنا،
 * فتُلتقط قبل التبديل وتُعاد حرفًا بحرف.
 */
const snapshots: Awaited<ReturnType<typeof adminSeoTemplates>> = [];
afterAll(async () => {
  for (const row of snapshots) {
    await db.seoTemplate.update({ where: { key: row.key }, data: row });
  }
  await db.auditLog.deleteMany({ where: { actorId: admin.id } });
});

async function remember(key: string): Promise<void> {
  if (snapshots.some((row) => row.key === key)) return;
  const row = (await adminSeoTemplates()).find((entry) => entry.key === key);
  if (row !== undefined) snapshots.push(row);
}

/**
 * ═══ قوالبُ السيو — كانت بلا قارئٍ ولا محرِّر ═══
 *
 * سمّتها البوابةُ ٦٣ «نموذجًا لا يعدّله شيء»، والقياسُ أخرج أسوأ: لا
 * شيء يقرؤها كذلك. والقرار ٢٦ رسمها «قالبًا + متغيّرات يحرّرها
 * الأدمن» فلم تُوصَل من طرفيها.
 */
describe('نصوص السيو تُقرأ وتُحرَّر', () => {
  it('الوجهة في الملاحة ولها شاشة ومسار', () => {
    const entry = ADMIN_NAV.flatMap((group) => group.items).find(
      (item) => item.href === '/admin/seo',
    );
    expect(entry).toBeDefined();
    expect(() => readFileSync(join(ROOT, 'src/app/admin/seo/page.tsx'))).not.toThrow();
    expect(() =>
      readFileSync(join(ROOT, 'src/app/api/v1/admin/seo/[key]/route.ts')),
    ).not.toThrow();
  });

  /**
   * **وسطحٌ بلا قالبٍ قيمةٌ بلا باب، وقالبٌ بلا سطحٍ نصٌّ لا يُعرض.**
   * فالعلاقةُ تُفحص في الاتّجاهين لا بعددٍ مكتوب.
   */
  it('لكل سطح قالب، ولكل قالب سطح معروف', async () => {
    const rows = await adminSeoTemplates();
    const surfaces = rows.map((row) => row.surface).sort();
    expect(surfaces).toEqual([...SEO_SURFACES].sort());
    expect(new Set(surfaces).size).toBe(rows.length);
  });

  it('وكل متغير له تسمية، وكل سطح له تسمية ومثال', () => {
    for (const surface of SEO_SURFACES) {
      expect(SEO_SURFACE_LABEL[surface]).toBeTruthy();
      expect(SEO_SAMPLE[surface]).toBeDefined();
      for (const name of SEO_VARIABLES[surface]) {
        expect(SEO_VARIABLE_LABEL[name], `المتغير «${name}» بلا تسمية`).toBeTruthy();
        /** **والمثالُ يملأ ما يذكره القالب** — وإلّا رأى المحرِّر فراغًا. */
        expect(SEO_SAMPLE[surface].values[name], `المثال لا يملأ «${name}»`).toBeTruthy();
      }
    }
  });

  /**
   * **والمتغيّرُ الذي يذكره الصفُّ المزروع هو ما تملؤه صفحتُه.**
   * `{brnad}` خطأٌ مطبعيّ يُفرِغ الفقرة بصمت، وصفٌّ مزروع يحمل
   * متغيّرًا لا تملؤه الصفحةُ عطلٌ يمرّ بلا شكوى.
   */
  it('ولا متغير في صف مزروع تجهله صفحته', async () => {
    for (const row of await adminSeoTemplates()) {
      const surface = row.surface as (typeof SEO_SURFACES)[number];
      for (const text of [row.titleAr, row.titleEn, row.introAr, row.introEn, row.outroAr, row.outroEn]) {
        expect(unknownPlaceholders(text, surface), `${row.key}: ${text}`).toEqual([]);
      }
    }
  });

  /**
   * ═══ والعددُ لا يحكم المعدود — في الصفوف المزروعة ═══
   *
   * أوّلُ صياغةٍ لهذه القوالب كتبت «{count} سيارة {brand}»، فطبعت
   * الصفحةُ **«3 سيارة تويوتا»** في `<meta description>` — وصوابُها
   * «3 سيارات». وكشفه فتحُ الصفحة لا اختبار.
   *
   * والنصُّ في القاعدة لا تبلغه البوابة ١٨ (لا مُصرِّف ولا لينت على
   * صفٍّ يكتبه مشغّل)، فيُفحص هنا على **ما في القاعدة فعلًا** — فيشمل
   * ما يصلها بترحيل وما يصلها ببذرة.
   */
  it('ولا عدد يجاور معدوده في صف مزروع', async () => {
    for (const row of await adminSeoTemplates()) {
      for (const text of [row.titleAr, row.introAr, row.outroAr]) {
        expect(countBeforeNoun(text), `${row.key}: ${text}`).toEqual([]);
      }
    }
  });

  /** **والفحصُ يُقاس بكسرِ ما يحرسه** — وإلّا مرّ أخضرَ أعمى. */
  it('والفحص يرى الصياغة الخاطئة ولا يُنذر على السعر', () => {
    expect(countBeforeNoun('{count} سيارة تويوتا')).toEqual(['count']);
    expect(countBeforeNoun('منها {inspected} سيارة مفحوصة')).toEqual(['inspected']);
    expect(countBeforeNoun('سيارات تويوتا المعروضة: {count}. وأسعارها')).toEqual([]);
    expect(countBeforeNoun('من {priceMin} إلى {priceMax} ريال')).toEqual([]);
  });

  /**
   * ═══ والفقرةُ تُحذف كاملةً أو تُطبع كاملة ═══
   *
   * القرار ٢٦: «إن كانت العيّنة أقل من ٨ أخفِ الفقرة كاملة». ويُفحص
   * **بتجاوز الحدّ** لا بوصف البيانات: تُصنع حالةُ النقص صراحةً.
   */
  it('فقرة ينقصها متغير تُحذف كاملة', () => {
    const text = 'منها {inspected} سيارة بتقرير فحص منشور.';
    expect(renderSeo(text, { inspected: '7' })).toBe('منها 7 سيارة بتقرير فحص منشور.');
    expect(renderSeo(text, { inspected: null })).toBe('');
    expect(renderSeo(text, { inspected: '' })).toBe('');
    expect(renderSeo(text, {})).toBe('');
    // ومتغيّرٌ ثانٍ ناقصٌ يُسقطها ولو كان الأوّل حاضرًا
    expect(renderSeo('{a} و{b}', { a: '1', b: null })).toBe('');
    expect(renderSeo('   ', { a: '1' })).toBe('');
  });

  it('ويُقرأ المتغير ويُعرَف المجهول', () => {
    expect(seoPlaceholders('{brand} في {city} و{brand}')).toEqual(['brand', 'city']);
    expect(unknownPlaceholders('{brand} {brnad}', 'landing_brand')).toEqual(['brnad']);
    expect(unknownPlaceholders('{model}', 'landing_brand')).toEqual(['model']);
    expect(unknownPlaceholders('{model}', 'landing_model')).toEqual([]);
  });

  /**
   * ═══ والقارئُ يصل الصفحةَ فعلًا ═══
   *
   * **والاختبار لا يفتح شاشة**، فيُقاس ما تقرؤه الشاشة: نصُّ الصفّ
   * مملوءًا بقيَم تركيبةٍ قائمة الآن، لا مثالًا مكتوبًا بيد.
   */
  it('ونصّ الصفحة من الصف لا من ملف الرسائل', async () => {
    const combination = (await landingCombinations()).find((entry) => entry.modelSlug === null);
    expect(combination, 'لا تركيبة هبوط مزروعة — فالقياس لا يقع').toBeDefined();
    if (combination === undefined) return;

    const content = await landingContent(combination.citySlug, combination.brandSlug, null);
    expect(content).not.toBeNull();
    if (content === null) return;

    const copy = await seoCopy('landing_brand', 'ar', landingSeoValues(content, 'ar'));
    expect(copy.title).toContain(content.brand);
    expect(copy.title).toContain(content.city);
    expect(copy.intro).toContain(content.brand);
    /** ولا قوسٌ باقٍ: متغيّرٌ لم يُملأ يعني فقرةً كان يجب أن تُحذف. */
    expect(copy.title).not.toContain('{');
    expect(copy.intro).not.toContain('{');
  });

  /**
   * **والإطفاءُ يعيد الصفحة إلى نصّها المدمج** — ولا يتركها بلا
   * عنوان. وهو كيف يسحب المشغّلُ نصًّا كتبه ولم يُعجبه.
   */
  it('وإطفاء الصف يعيد السقوط الآمن', async () => {
    await remember('landing_city_brand');
    await db.seoTemplate.update({
      where: { key: 'landing_city_brand' },
      data: { active: false },
    });
    expect(await seoTemplate('landing_brand')).toBeNull();

    const copy = await seoCopy('landing_brand', 'ar', { brand: 'x', city: 'y', count: '1' });
    expect(copy.title).toBeNull();
    expect(copy.intro).toBeNull();
  });

  /**
   * **وحارسٌ في العميل ليس حارسًا**: الشاشة تُنذر على المتغيّر
   * المجهول، والنداءُ المباشر يصل بلا نافذة — فالخادم يرفض.
   */
  it('والخادم يرفض متغيرا لا تملؤه الصفحة', async () => {
    await remember('landing_city_brand');
    const result = await updateSeoTemplate(
      admin,
      'landing_city_brand',
      { titleAr: 'سيارات {brnad} في {city}' },
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('UNKNOWN_VARIABLE');
      expect(result.detail).toBe('brnad');
    }
    // ولم يُكتب شيء
    const row = await db.seoTemplate.findUnique({ where: { key: 'landing_city_brand' } });
    expect(row?.titleAr).not.toContain('brnad');
  });

  it('ويرفض متغيرا لسطح آخر، ونصا أطول من الحقل', async () => {
    await remember('landing_city_brand');
    const wrongSurface = await updateSeoTemplate(
      admin,
      'landing_city_brand',
      { titleAr: '{model} في {city}' },
      null,
    );
    expect(wrongSurface.ok).toBe(false);

    const tooLong = await updateSeoTemplate(
      admin,
      'landing_city_brand',
      { titleAr: 'ا'.repeat(201) },
      null,
    );
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.reason).toBe('TOO_LONG');
  });

  it('ويُحفظ مع سجل تدقيق', async () => {
    await remember('landing_city_brand');
    const result = await updateSeoTemplate(
      admin,
      'landing_city_brand',
      { titleAr: 'سيارات {brand} المستعملة في {city}', active: true },
      '10.0.0.9',
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.template.titleAr).toContain('المستعملة');

    const log = await db.auditLog.findFirst({
      where: { actorId: admin.id, action: 'seo.update', entityId: 'landing_city_brand' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log?.entity).toBe('SeoTemplate');
    expect(log?.ip).toBe('10.0.0.9');
  });

  it('ومفتاح لا وجود له يُردّ لا يُنشأ', async () => {
    const result = await updateSeoTemplate(admin, 'no_such_template', { titleAr: 'x' }, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_FOUND');
    expect(await db.seoTemplate.findUnique({ where: { key: 'no_such_template' } })).toBeNull();
  });
});

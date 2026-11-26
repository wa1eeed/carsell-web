import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { db } from '@/lib/db';
import {
  normalizeDomain,
  publicSite,
  saveDealerSite,
  validateSite,
} from '@/lib/domain/dealer-site';

/**
 * ═══ `D16` — موقعُ المعرض الرسميّ ═══
 *
 * **وهو غيرُ صفحته في سوقنا**: تلك صفحةٌ داخل كارز بشريطها، وهذا موقعُه.
 */

const made: string[] = [];

afterAll(async () => {
  if (made.length > 0) await db.dealerSite.deleteMany({ where: { dealerId: { in: made } } });
  await db.auditLog.deleteMany({ where: { action: 'dealer.site.saved' } });
});

describe('normalizeDomain', () => {
  /** **ومن لصق رابطًا يُنظَّف له لا يُردّ** — فالخطأ متوقَّع لا شاذّ. */
  it('ينظف ما يلصقه صاحبه', () => {
    expect(normalizeDomain('https://www.Cars.Example.com/stock')).toBe('cars.example.com');
    expect(normalizeDomain('  CARS.EXAMPLE.COM  ')).toBe('cars.example.com');
  });
});

describe('validateSite', () => {
  const base = { slug: 'jeddah-auto', tagline: null, accent: null, visible: true, customDomain: null };

  /** **والعنوانُ لاتينيّ** — ومنه الرابط، وعربيٌّ يصير مُرمَّزًا. */
  it('يرفض عنوانا غير لاتيني', () => {
    expect(validateSite({ ...base, slug: 'جدة-أوتو' }).slug).toBe('SHORT');
    expect(validateSite(base)).toEqual({});
  });

  it('ويرفض لونا ليس سادسا عشريا، ودومينا ليس مضيفا', () => {
    expect(validateSite({ ...base, accent: 'أزرق' }).accent).toBe('FORMAT');
    expect(validateSite({ ...base, accent: '#0f5d8f' })).toEqual({});
    expect(validateSite({ ...base, customDomain: 'not a host' }).customDomain).toBe('FORMAT');
    expect(validateSite({ ...base, customDomain: 'cars.example.com' })).toEqual({});
  });
});

describe('موقع المعرض', () => {
  it('يبدأ مخفيا، ولا يُفتح حتى يُنشر', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { id: true, dealerId: true },
    });
    const dealerId = owner.dealerId as string;
    made.push(dealerId);
    const actor = { userId: owner.id, dealerId };

    const hidden = await saveDealerSite(actor, {
      slug: 'site-test-showroom',
      tagline: null,
      accent: null,
      visible: false,
      customDomain: null,
    });
    expect(hidden.ok).toBe(true);

    /** **والمخفيّةُ كالمعدومة** — ولا يُفرَّق بينهما: وجودُها ليس خبرًا. */
    expect(await publicSite('site-test-showroom')).toBeNull();

    await saveDealerSite(actor, {
      slug: 'site-test-showroom',
      tagline: 'موقع الاختبار',
      accent: '#0f5d8f',
      visible: true,
      customDomain: null,
    });
    const open = await publicSite('site-test-showroom');
    expect(open?.site.tagline).toBe('موقع الاختبار');
    expect(open?.site.accent).toBe('#0f5d8f');
  });

  /**
   * **وتبديلُ الدومين يُبطل إثباتَه.** من أثبت الأوّل ثمّ كتب الثاني لم
   * يُثبت الثاني — وبقاءُ الإثبات يجعل الصفحةَ تُخدَم على اسمٍ لا يملكه.
   */
  it('وتبديل الدومين يبطل إثباته ويولد رمزا جديدا', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { id: true, dealerId: true },
    });
    const dealerId = owner.dealerId as string;
    const actor = { userId: owner.id, dealerId };

    const first = await saveDealerSite(actor, {
      slug: 'site-test-showroom',
      tagline: null,
      accent: null,
      visible: true,
      customDomain: 'one.example.com',
    });
    expect(first.ok && first.domainToken !== null).toBe(true);

    await db.dealerSite.update({
      where: { dealerId },
      data: { domainVerifiedAt: new Date() },
    });

    const second = await saveDealerSite(actor, {
      slug: 'site-test-showroom',
      tagline: null,
      accent: null,
      visible: true,
      customDomain: 'two.example.com',
    });
    expect(second.ok).toBe(true);

    const row = await db.dealerSite.findUniqueOrThrow({
      where: { dealerId },
      select: { domainVerifiedAt: true, domainToken: true },
    });
    expect(row.domainVerifiedAt).toBeNull();
    if (first.ok) expect(row.domainToken).not.toBe(first.domainToken);
  });

  /** **ولا يخرج رمزُ الإثبات في صفحةٍ عامّة** — هو سرُّ تحقّقٍ لا بيان. */
  it('ولا يخرج رمز الإثبات للزائر', async () => {
    const open = await publicSite('site-test-showroom');
    expect(open?.site.domainToken).toBeNull();
  });
});

describe('حدود الموقع', () => {
  /**
   * **وجذرٌ خارج توجيه اللغة يُستثنى في الوسيط** — وإلّا حُوّل إلى
   * `/ar/showroom/…` وردّ ٣٠٧ إلى لا شيء. وقع لـ`/provider` ثمّ
   * `/dealer` ثمّ هذا.
   */
  it('الوسيط يستثني جذر الموقع', () => {
    const middleware = readFileSync('src/middleware.ts', 'utf8');
    expect(middleware).toContain("pathname.startsWith('/showroom')");
  });

  /**
   * **وكلُّ جذرٍ يعرض مكوّناتِنا يحمل مزوّدَ الترجمة** — و`CarCard` يحوي
   * `Countdown` الذي يطلبها، فسقط الموقعُ بـ٥٠٠ بدونه. ولم يكشفه بناءٌ
   * ولا اختبار؛ كشفه فتحُ الصفحة.
   */
  it('وجذر الموقع يحمل مزود الترجمة', () => {
    const layout = readFileSync('src/app/showroom/layout.tsx', 'utf8');
    expect(layout).toContain('NextIntlClientProvider');
  });

  /** **والشراءُ في كارز** — ومسارُ شراءٍ ثانٍ هنا مساران يتباعدان. */
  it('ولا مسار شراء في الموقع', () => {
    const page = readFileSync('src/app/showroom/[slug]/page.tsx', 'utf8');
    expect(page).not.toContain('/api/v1/orders');
    expect(page).toContain('SITE_URL');
  });
});

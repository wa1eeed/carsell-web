import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { dashboardCards, deltaPct, listingsByCity } from '@/lib/domain/admin-dashboard';

afterAll(async () => {
  await db.$disconnect();
});

const TO = new Date();
const FROM = new Date(TO.getTime() - 365 * 86_400_000);

describe('═══ معيار A1 ═══ كل رقم من قاعدة البيانات', () => {
  /**
   * الإثبات **بإعادة الاشتقاق**: كل رقم في البطاقة يُقارَن باستعلام
   * مستقلّ. ولو كان أيٌّ منها ثابتًا مكتوبًا لاختلف عن استعلامه أوّل
   * مرّة تتغيّر البيانات.
   */
  /**
   * ═══ والإجماليُّ إجماليُّ المنصّة لا عدُّ المدى ═══
   *
   * كان هذا الاختبار يفحص المدى — **فثبّت السلوكَ المنحرف**: المشغّل
   * يقرأ «المستخدمون ١» ومنصّتُه فيها واحدٌ وثلاثون. والتصميم (`A1`)
   * يرسم الإجماليَّ رقمًا والزيادةَ شارةً، فيُفحص الطرفان.
   */
  it('الإجمالي إجمالي المنصة، والزيادة عدد المدى — كلاهما باستعلام مستقل', async () => {
    const cards = await dashboardCards(FROM, TO);
    const at = (key: string) => cards.find((card) => card.key === key);
    const window = { gte: FROM, lt: TO };

    expect(at('users')?.total).toBe(await db.user.count());
    expect(at('users')?.added).toBe(await db.user.count({ where: { createdAt: window } }));

    expect(at('vehicles')?.total).toBe(await db.vehicle.count());
    expect(at('vehicles')?.added).toBe(await db.vehicle.count({ where: { createdAt: window } }));

    expect(at('listings')?.total).toBe(
      await db.listing.count({ where: { publishedAt: { not: null } } }),
    );
    expect(at('listings')?.added).toBe(await db.listing.count({ where: { publishedAt: window } }));

    expect(at('orders')?.total).toBe(await db.order.count());
    expect(at('orders')?.added).toBe(await db.order.count({ where: { createdAt: window } }));

    expect(at('auctions')?.total).toBe(await db.auction.count());
    expect(at('auctions')?.added).toBe(await db.auction.count({ where: { startsAt: window } }));

    expect(at('serviceRequests')?.total).toBe(await db.serviceRequest.count());
    expect(at('serviceRequests')?.added).toBe(
      await db.serviceRequest.count({ where: { createdAt: window } }),
    );

    /**
     * **ولا يُصدَّق تطابقٌ لا يميّز شيئًا.** لو كان الإجماليُّ يساوي
     * عدَّ المدى في هذه البيانات لمرّ الفحصان على شيفرةٍ مكسورة —
     * فيُطلَب أن يكون للمنصّة تاريخٌ قبل المدى.
     */
    const users = at('users');
    expect(users?.total ?? 0).toBeGreaterThan(users?.added ?? 0);
  });

  it('شرائح العملاء متباينة وتجمع الإجمالي', async () => {
    const users = (await dashboardCards(FROM, TO)).find((card) => card.key === 'users');
    const sum = (users?.segments ?? []).reduce((total, part) => total + part.count, 0);
    // ولولا التباين لناقضت البطاقةُ نفسها في سطرين متجاورين
    expect(sum).toBe(users?.total);
  });

  it('شرائح الحالات تجمع إجمالياتها', async () => {
    const cards = await dashboardCards(FROM, TO);
    for (const key of ['listings', 'orders', 'auctions']) {
      const card = cards.find((entry) => entry.key === key);
      const sum = (card?.segments ?? []).reduce((total, part) => total + part.count, 0);
      expect(sum, key).toBe(card?.total);
    }
  });

  it('المدى السابق مساوٍ للمدى ويسبقه مباشرةً', async () => {
    const to = new Date('2026-08-01T00:00:00Z');
    const from = new Date('2026-07-02T00:00:00Z'); // ٣٠ يومًا
    const cards = await dashboardCards(from, to);
    const users = cards.find((card) => card.key === 'users');

    const expected = await db.user.count({
      where: { createdAt: { gte: new Date('2026-06-02T00:00:00Z'), lt: from } },
    });
    expect(users?.previous).toBe(expected);
  });

  it('لا رقم مكتوب في الشاشة نفسها', () => {
    /**
     * الفحص على المصدر: أرقام JSX الوحيدة المسموحة ما كان تخطيطًا
     * (فئات Tailwind ومؤشّرات مصفوفات). أيّ رقم داخل `value=` أو
     * `count=` بحرفه يعني بيانًا مكتوبًا بدل أن يُقرأ.
     */
    const source = readFileSync('src/app/admin/page.tsx', 'utf8');
    const literals = [
      ...source.matchAll(/\b(?:value|count|total|amount)=\{(-?\d[\d_.]*)\}/g),
    ].map((match) => match[1]);
    expect(literals).toEqual([]);
  });

  it('العميل المتكرّر تراكميّ لا مدَويّ — فلا مقارنة له', async () => {
    const repeat = (await dashboardCards(FROM, TO)).find((card) => card.key === 'repeat');
    // «صفر» مقارنةً تُقرأ هبوطًا، والفراغ يُقرأ «لا يُقارَن»
    expect(repeat?.previous).toBeNull();

    const buyers = await db.order.groupBy({
      by: ['buyerId'],
      where: { status: 'COMPLETED' },
      _count: { _all: true },
    });
    expect(repeat?.total).toBe(buyers.filter((row) => (row._count._all ?? 0) >= 2).length);
  });
});

describe('A1 — المدن والفروق', () => {
  it('المدن تجمع كل الإعلانات — والبقية تُجمع لا تُحذف', async () => {
    const rows = await listingsByCity();
    const shown = rows.reduce((total, row) => total + row.count, 0);
    const real = await db.listing.count({ where: { publishedAt: { not: null } } });
    expect(shown).toBe(real);
    /** ولا يُصدَّق صفرٌ قبل إثبات أن هناك ما يُعَدّ. */
    expect(shown).toBeGreaterThan(0);

    // ونفس الجمهور الذي تعدّه بطاقة الإعلانات — رقمان متطابقان لا متقاربان
    const card = (await dashboardCards(FROM, TO)).find((entry) => entry.key === 'listings');
    expect(shown).toBe(card?.total);
  });

  it('الفرق المئوي، والقسمة على صفر ليست ٠٪', () => {
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(80, 100)).toBe(-20);
    // لا أساس ⇒ لا نسبة. و«٠٪» تعني «لم يتغيّر» وهي كذبة هنا
    expect(deltaPct(50, 0)).toBeNull();
    expect(deltaPct(50, null)).toBeNull();
  });
});

/**
 * ═══ ولا رقمان لاسمٍ واحد في لوحةٍ واحدة ═══
 *
 * بطاقةُ النموّ كانت تقول «حجم المبيعات ٨٧٠٬٦٧٥» وتبويبُ المالية
 * «قيمة المبيعات ٨٤٢٬٩٤٠» عن المدى نفسِه: الأولى تجمع `totalAmount`
 * (وفيه عمولتُنا ورسومُنا) والثانية `agreedPrice`. و**`GMV` قيمةُ
 * البضاعة لا ما قُبض فوقها** — فالمالية كانت على حقّ.
 */
describe('A1 — حجم المبيعات واحد في اللوحة كلها', () => {
  it('GMV مجموع أسعار المركبات لا إجمالي ما دفعه المشتري', async () => {
    const { growthKpis } = await import('@/lib/domain/admin-kpis');
    const { kpis } = await growthKpis(FROM, TO);
    const gmv = kpis.gmv;

    const orders = await db.order.findMany({
      where: { createdAt: { gte: FROM, lt: TO }, status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: { agreedPrice: true, totalAmount: true },
    });
    const agreed = orders.reduce((total, row) => total + Number(row.agreedPrice), 0);
    const paid = orders.reduce((total, row) => total + Number(row.totalAmount), 0);

    expect(gmv?.value).toBe(agreed);
    /**
     * **ولا يُصدَّق تطابقٌ لا يميّز.** لو تساوى المجموعان في هذه
     * البيانات لمرّ الفحصُ على الشيفرة المكسورة — فيُطلَب أن تكون
     * هناك رسومٌ فوق السعر أصلًا.
     */
    expect(paid).toBeGreaterThan(agreed);
  });
});

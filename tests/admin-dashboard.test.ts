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
  it('كل إجمالي يطابق استعلامًا مستقلًّا', async () => {
    const cards = await dashboardCards(FROM, TO);
    const at = (key: string) => cards.find((card) => card.key === key);
    const window = { gte: FROM, lt: TO };

    expect(at('users')?.total).toBe(await db.user.count({ where: { createdAt: window } }));
    expect(at('vehicles')?.total).toBe(await db.vehicle.count({ where: { createdAt: window } }));
    expect(at('listings')?.total).toBe(
      await db.listing.count({ where: { publishedAt: window } }),
    );
    expect(at('orders')?.total).toBe(await db.order.count({ where: { createdAt: window } }));
    expect(at('auctions')?.total).toBe(await db.auction.count({ where: { startsAt: window } }));
    expect(at('serviceRequests')?.total).toBe(
      await db.serviceRequest.count({ where: { createdAt: window } }),
    );
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
    const rows = await listingsByCity(FROM, TO);
    const shown = rows.reduce((total, row) => total + row.count, 0);
    const real = await db.listing.count({ where: { publishedAt: { gte: FROM, lt: TO } } });
    expect(shown).toBe(real);

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

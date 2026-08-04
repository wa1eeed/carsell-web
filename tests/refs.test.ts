import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { nextListingRef, nextOrderRef } from '../src/lib/domain/refs';

afterAll(async () => {
  await db.$disconnect();
});

describe('المرجع من الأعلى لا من العدد', () => {
  /**
   * **كان يُبنى بـ`count() + 1`، والعدد ليس الأعلى.** يكفي أن يُحذف
   * طلبٌ واحد ليصير التالي مصادمًا لمرجعٍ قائم، فيسقط الإنشاء بـ
   * «Unique constraint failed» — ولا يتّهم الخطأ الفجوة بل الإنشاء.
   *
   * وقع فعلًا: أوّل صفقة اكتملت تركت `ORD-2026-1013`، فصار كل طلب
   * جديد يصطدم به لأن العدّ يقول ١٠١٢.
   */
  it('لا يصطدم بمرجعٍ قائم ولو كانت في التسلسل فجوة', async () => {
    const now = new Date('2026-08-04T00:00:00.000Z');
    const ref = await nextOrderRef(db, now);

    // لا وجود له — وهذا كل المطلوب
    expect(await db.order.findUnique({ where: { ref } })).toBeNull();

    // وهو أعلى من كل قائم لهذه السنة
    const existing = await db.order.findMany({
      where: { ref: { startsWith: 'ORD-2026-' } },
      select: { ref: true },
    });
    const highest = Math.max(
      0,
      ...existing.map((row) => Number(row.ref.slice('ORD-2026-'.length))).filter(Number.isFinite),
    );
    expect(Number(ref.slice('ORD-2026-'.length))).toBeGreaterThan(highest);
  });

  it('ومرجع الإعلان كذلك — بأربع خانات مُصفَّرة', async () => {
    const now = new Date('2026-08-04T00:00:00.000Z');
    const ref = await nextListingRef(db, now);

    expect(ref).toMatch(/^ADS2026A\d{4,}$/);
    expect(await db.listing.findUnique({ where: { ref } })).toBeNull();

    const existing = await db.listing.findMany({
      where: { ref: { startsWith: 'ADS2026A' } },
      select: { ref: true },
    });
    const highest = Math.max(
      0,
      ...existing.map((row) => Number(row.ref.slice('ADS2026A'.length))).filter(Number.isFinite),
    );
    expect(Number(ref.slice('ADS2026A'.length))).toBeGreaterThan(highest);
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { customerValue } from '@/lib/domain/admin-orders';
import { resolveSegment } from '@/lib/domain/admin-campaigns';

afterAll(async () => {
  await db.$disconnect();
});

let seq = 0;
async function user(verified: boolean) {
  seq += 1;
  return db.user.create({
    data: {
      phone: `+96653${String(Date.now()).slice(-6)}${String(seq).padStart(2, '0')}`,
      name: 'عميل اختبار',
      identityStatus: verified ? 'VERIFIED' : 'NONE',
    },
  });
}

/**
 * ═══ مقامُ «قيمة العميل» من اشترى لا من سجّل ═══
 *
 * والفرقُ يُقاس بصنعِ حاله: حسابٌ جديد بلا طلب **يحرّك نسبة التوثيق
 * ولا يحرّك متوسّط القيمة**. ولو كان المقام كلَّ مسجَّل لتحرّك الاثنان —
 * فألفُ حسابٍ جديد تنصّف «قيمة العميل» بلا أن يتغيّر سلوكُ من يشتري.
 */
describe('قيمة العميل — ومقامها', () => {
  it('حسابٌ بلا طلب لا يحرّك المتوسط، ويحرّك نسبة التوثيق', async () => {
    const before = await customerValue();

    const fresh = await user(false);
    const after = await customerValue();

    expect(after.averageValue).toBe(before.averageValue);
    expect(after.dealsPerBuyer).toBe(before.dealsPerBuyer);
    expect(after.buyers).toBe(before.buyers);
    // غيرُ موثّقٍ يُنقص النسبة أو يُبقيها — ولا يرفعها أبدًا
    expect(after.verifiedPct).toBeLessThanOrEqual(before.verifiedPct);

    await db.user.delete({ where: { id: fresh.id } });
  });
});

/**
 * **وشرطُ التوثيق مفردةٌ في الشرائح** — وبه تُخاطَب شريحةُ «أكمل
 * توثيقك»، وهي أنفعُ حملةٍ في سوقٍ يشترط التوثيق للشراء.
 */
describe('شرط موثق الهوية', () => {
  it('ينفي ويُثبت — والمجموع لا ينقص أحدًا', async () => {
    const verified = await user(true);
    const plain = await user(false);

    const yes = await resolveSegment([{ field: 'isVerified' }]);
    const no = await resolveSegment([{ field: 'isVerified', negate: true }]);
    const all = await resolveSegment([]);

    expect(yes.matched + no.matched).toBe(all.matched);
    expect(yes.matched).toBeGreaterThan(0);
    expect(no.matched).toBeGreaterThan(0);

    await db.user.deleteMany({ where: { id: { in: [verified.id, plain.id] } } });
  });
});

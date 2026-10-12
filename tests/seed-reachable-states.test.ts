import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';

/**
 * ═══ كل صفٍّ مزروع حالةٌ يبلغها المنتج ═══
 *
 * البذرة تكتب الصفوف مباشرةً، فتستطيع أن تُركّب حالةً **لا يستطيع
 * المنتج تركيبها** — والصفّ صحيحٌ وحده، والتناقض بين صفّين.
 *
 * ولا شيء يسقط: الأنواع تمرّ، والشاشة تُصيَّر، والاختبارات خضراء لأن
 * كلًّا منها يصنع صفوفه. **ويُقرأ العطلُ في الشاشة وهو في البيانات** —
 * وقد وقع مرّتين:
 *
 *   · بصمات صورٍ مزروعة بمسافة هامينغ ١، فأُحيل كل إعلانٍ جديد إلى
 *     المراجعة — وليست علّة اختبار، بل حالُ المنتج على هذه البيانات.
 *   · نزاعٌ حُسم بتسوية جزئية والضمان `RELEASED` — فالكرت يعرض
 *     «حُسم للمشتري» فوق «أُفرج للبائع».
 *
 * **وأثرُه على الأرقام لا على الشكل**: إعلانان بحالة `SOLD` بلا طلب
 * كانا يضخّمان مؤشّر «نسبة البيع من المعروض» ببيعتين لم تقعا.
 *
 * فهذه بوابة الصنف: ثوابتُ بين الكيانات يضمنها النطاق، وكلّ تناقضٍ
 * جديد يُضاف هنا مرّة.
 *
 * ═══ والحكم على المزروع لا على عدّادٍ عامّ ═══
 *
 * اختبارٌ يسأل «كم في القاعدة كلِّها» يسقط بما لا يقيسه: طلبٌ يصنعه
 * ملفٌّ آخر ويُنظّفه في نهايته يكفي أن يسبقه هذا الملفّ فيسقط — ويبدو
 * تقطّعًا وهو شرطٌ ناقص. فالشكلان هنا هما شكلا `global-setup` نفسهما.
 */

/** جوّالُ اختبار: `+9665` ثم أحدَ عشرَ رقمًا فأكثر — والمزروع ثمانية. */
const TEST_USER_PHONE = /^\+9665\d{11,}$/;
/** مرجعُ إعلانِ اختبار: بادئةٌ ثم طابع زمنيّ — والمزروع `ADS2026A0001`. */
const TEST_LISTING_REF = /^[A-Z]{3}\d{9,}$/;

afterAll(async () => {
  await db.$disconnect();
});

/** قرارُ النزاع وحالةُ الضمان — كما تكتبهما `resolveDispute`. */
const ESCROW_FOR: Record<string, string> = {
  FULL_REFUND: 'REFUNDED',
  PARTIAL_SETTLEMENT: 'PARTIAL_REFUND',
  RELEASE_TO_SELLER: 'RELEASED',
};

const seededOrder = (row: { buyer: { phone: string } }): boolean =>
  !TEST_USER_PHONE.test(row.buyer.phone);

describe('═══ حالات يبلغها المنتج ═══', () => {
  it('نزاعٌ محسومٌ وضمانُه يتبع قراره', async () => {
    const resolved = await db.dispute.findMany({
      where: { resolution: { not: null } },
      select: {
        resolution: true,
        order: {
          select: {
            ref: true,
            buyer: { select: { phone: true } },
            escrow: { select: { status: true } },
          },
        },
      },
    });

    const mismatched = resolved
      .filter((row) => seededOrder(row.order))
      .filter((row) => row.order.escrow !== null)
      .filter((row) => row.order.escrow?.status !== ESCROW_FOR[row.resolution ?? ''])
      .map((row) => `${row.order.ref}: ${row.resolution} → ${row.order.escrow?.status}`);

    expect(mismatched).toEqual([]);
  });

  it('إعلانٌ مباعٌ له طلبٌ باعه', async () => {
    /**
     * `closeListingSold` وحدها تكتب `SOLD`، ولا تُنادى إلا من اكتمال
     * طلب. فإعلانٌ مباعٌ بلا طلبٍ **بيعةٌ بلا مشترٍ** — ويُحسب في
     * «نسبة البيع من المعروض» فيضخّمها.
     */
    const orphans = await db.listing.findMany({
      where: { status: 'SOLD', orders: { none: {} } },
      select: { ref: true },
    });

    expect(orphans.map((row) => row.ref).filter((ref) => !TEST_LISTING_REF.test(ref))).toEqual([]);
  });

  it('طلبٌ بلغ الدفع فما بعده له ضمان', async () => {
    const PAID = ['PAYMENT', 'TRANSFER', 'DONE'] as const;
    const without = await db.order.findMany({
      where: { stage: { in: [...PAID] }, escrow: { is: null } },
      select: { ref: true, buyer: { select: { phone: true } } },
    });

    expect(without.filter(seededOrder).map((row) => row.ref)).toEqual([]);
  });

  it('طلبٌ مكتملٌ وإعلانُه مُغلق', async () => {
    /** الطلب يُكمل فيُغلق إعلانه — وإعلانٌ يبقى معروضًا يُباع مرّتين. */
    const stillOpen = await db.order.findMany({
      where: { status: 'COMPLETED', listing: { status: 'PUBLISHED' } },
      select: { ref: true, buyer: { select: { phone: true } } },
    });

    expect(stillOpen.filter(seededOrder).map((row) => row.ref)).toEqual([]);
  });
});

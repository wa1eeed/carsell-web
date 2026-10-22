import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { createOffer, counterOffer, declineOffer } from '@/lib/domain/offers';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();
const planted: string[] = [];

afterAll(async () => {
  if (planted.length === 0) return;
  await db.notification.deleteMany({ where: { entityId: { in: planted } } });
  await db.offer.deleteMany({ where: { id: { in: planted } } });
});

/**
 * ═══ والطقمُ يشترط ما يفترضه ═══
 *
 * ثلاثُ قواعد في `createOffer` تُسقط اختبارًا يأمل: الإعلان نوعُه
 * `NEGOTIATION` لا مجرّد «قابل للتفاوض»، ولا يُقبل عرضان نشطان من
 * مشترٍ واحد على إعلان، **ومبلغٌ دون `minAcceptPrice` يُنشأ مرفوضًا
 * تلقائيًّا** — فاختبارُ الرفض الصريح يقيس رفضًا آليًّا ويظنّه نفسَه.
 */
async function listing() {
  return db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED', type: 'NEGOTIATION', orders: { none: {} } },
    select: { id: true, ref: true, sellerId: true, askPrice: true, minAcceptPrice: true },
  });
}

/** مبلغٌ فوق الحدّ الأدنى — فلا يُرفض آليًّا قبل أن يُرفض صراحةً. */
function above(row: { askPrice: unknown; minAcceptPrice: unknown }): number {
  const floor = row.minAcceptPrice === null ? 0 : Number(row.minAcceptPrice);
  return Math.max(Math.round(Number(row.askPrice) * 0.95), Math.ceil(floor) + 1000);
}

/** مشترٍ بلا عرضٍ نشط على هذا الإعلان — والشرطُ يُشترَط لا يُؤمَل. */
async function buyer(listingId: string, exclude: readonly string[]) {
  return db.user.findFirstOrThrow({
    where: {
      id: { notIn: [...exclude] },
      status: 'ACTIVE',
      offers: { none: { listingId, status: { in: ['PENDING', 'COUNTERED'] } } },
    },
    select: { id: true },
  });
}

/**
 * ═══ «أيَرفض البائعُ عرضًا صراحةً؟» — سُئل ٢٠٢٦-١٠-١٦ ولم يُجَب ═══
 *
 * كان أمام البائع «اقبل» و«قابِل» وحدهما، فمن لا يريد العرض يصمت —
 * **فيبقى المشتري ثماني وأربعين ساعة ينتظر ردًّا لن يأتي**. والقالب
 * `offer.rejected` مزروعٌ منذ بُني بلا كاتب.
 */
describe('رفض العرض صراحة', () => {
  it('والبائع يرفض عرضا وصله، فيصل المشتري خبره', async () => {
    const row = await listing();
    const other = await buyer(row.id, [row.sellerId]);

    const made = await createOffer({
      listingRef: row.ref,
      buyerId: other.id,
      amount: above(row),
    });
    expect(made.ok, 'تعذّر إنشاء العرض').toBe(true);
    if (!made.ok) return;
    planted.push(made.offer.id);

    const result = await declineOffer({ offerId: made.offer.id, userId: row.sellerId });
    expect(result.ok).toBe(true);

    const after = await db.offer.findUniqueOrThrow({ where: { id: made.offer.id } });
    expect(after.status).toBe('REJECTED');
    /** **والرفضُ المقصود يُفرَّق من الآليّ** — وإلّا قُرئ في الإحصاء واحدًا. */
    expect(after.autoRejected).toBe(false);

    const bell = await db.notification.findFirst({
      where: { userId: other.id, entityId: made.offer.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(bell, 'لم يصل المشتري خبرٌ').not.toBeNull();
    expect(bell?.templateKey).toBe('offer.rejected');
  }, 30_000);

  /** **ولا يرفض المرسِلُ عرضَه** — له السحب، والرفض لمن وصله. */
  it('ولا يرفض المرسل عرضه', async () => {
    const row = await listing();
    const other = await buyer(row.id, [row.sellerId]);
    const made = await createOffer({
      listingRef: row.ref,
      buyerId: other.id,
      amount: above(row),
    });
    if (!made.ok) return;
    planted.push(made.offer.id);

    const result = await declineOffer({ offerId: made.offer.id, userId: other.id });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NOT_RECIPIENT');
    /** ولم يُكتب شيء — الرفضُ قبل الكتابة. */
    const after = await db.offer.findUniqueOrThrow({ where: { id: made.offer.id } });
    expect(after.status).toBe('PENDING');
  }, 30_000);

  /**
   * ═══ والمُرسِل لا يُشتقّ من الدور ═══
   *
   * المقابلُ يحتفظ بـ`buyerId` الأصليّ، فاشتقاق المستقبِل من الدور
   * يجعل البائع يرفض عرضَ نفسه — وهو الصنف الذي أُصلح في القبول.
   */
  it('ومقابل البائع يرفضه المشتري لا البائع', async () => {
    const row = await listing();
    const other = await buyer(row.id, [row.sellerId]);
    const made = await createOffer({
      listingRef: row.ref,
      buyerId: other.id,
      amount: above(row),
    });
    if (!made.ok) return;
    planted.push(made.offer.id);

    const back = await counterOffer({
      offerId: made.offer.id,
      sellerId: row.sellerId,
      amount: Math.round(Number(row.askPrice) * 0.98),
    });
    expect(back.ok, 'تعذّر العرض المقابل').toBe(true);
    if (!back.ok) return;
    planted.push(back.offer.id);

    /** البائعُ أرسله، فلا يرفضه. */
    const bySeller = await declineOffer({ offerId: back.offer.id, userId: row.sellerId });
    expect(bySeller.ok).toBe(false);

    /** والمشتري وصله، فيرفضه. */
    const byBuyer = await declineOffer({ offerId: back.offer.id, userId: other.id });
    expect(byBuyer.ok).toBe(true);
    const after = await db.offer.findUniqueOrThrow({ where: { id: back.offer.id } });
    expect(after.status).toBe('REJECTED');
  }, 30_000);

  /** **والرفضُ لا يمسّ غيره** — بخلاف القبول الذي يُغلق الباقي. */
  it('ولا يمس الرفض بقية عروض الإعلان', async () => {
    const row = await listing();
    const other = await buyer(row.id, [row.sellerId]);
    const third = await buyer(row.id, [row.sellerId, other.id]);

    const a = await createOffer({ listingRef: row.ref, buyerId: other.id, amount: above(row) });
    const b = await createOffer({ listingRef: row.ref, buyerId: third.id, amount: above(row) });
    if (!a.ok || !b.ok) return;
    planted.push(a.offer.id, b.offer.id);

    expect((await declineOffer({ offerId: a.offer.id, userId: row.sellerId })).ok).toBe(true);
    const untouched = await db.offer.findUniqueOrThrow({ where: { id: b.offer.id } });
    expect(untouched.status).toBe('PENDING');
  }, 30_000);

  it('والزر في الشاشة والمسار يقبل الفعل', () => {
    const ui = stripComments(
      readFileSync(join(ROOT, 'src/components/site/OfferActions.tsx'), 'utf8'),
    );
    expect(ui).toContain("action: 'decline'");
    const route = stripComments(
      readFileSync(join(ROOT, 'src/app/api/v1/offers/[id]/route.ts'), 'utf8'),
    );
    expect(route).toContain("z.literal('decline')");
    expect(route).toContain('declineOffer');
  });
});

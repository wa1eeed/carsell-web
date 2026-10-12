import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { favoritedRefs, toggleFavorite } from '@/lib/domain/favorites';

/**
 * ═══ المفضّلة ═══
 *
 * العطل الذي وُلد منه هذا الملف: **تُقرأ في أربعة مواضع وتُكتب في لا
 * شيء.** صفحتُها تعرضها، وبطاقةُ الحساب تعدّها، وملفُّ العميل في
 * اللوحة يعرض العدد، وترشيحُ الحملات يستهدف «من له مفضّلة» — ولا
 * قلبَ في بطاقةٍ ولا في صفحة مركبة.
 *
 * وكشفته **أداةُ `dead-ends`** لا التصفّح: نموذجٌ يكتبه الزرع وحده.
 */

const made: string[] = [];

afterAll(async () => {
  await db.favorite.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
});

async function pair(): Promise<{ userId: string; ref: string; listingId: string }> {
  const listing = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED' },
    select: { id: true, ref: true, sellerId: true },
  });
  /**
   * **والطقم يشترط ما يفترضه.** كان يأخذ أيَّ مستخدمٍ غير البائع
   * **ويفترض** أنه لم يُفضّل هذا الإعلان — والبذرة تصنع مفضّلاتٍ
   * عشوائية، فيسقط الاختبار على زرعٍ بعينه ويبدو تقطّعًا وهو شرطٌ ناقص.
   */
  const user = await db.user.findFirstOrThrow({
    where: {
      id: { not: listing.sellerId },
      favorites: { none: { listingId: listing.id } },
    },
    select: { id: true },
  });
  return { userId: user.id, ref: listing.ref, listingId: listing.id };
}

describe('قلبُ المفضّلة', () => {
  it('يضيف ثم يحذف بالعملية نفسها', async () => {
    const { userId, ref, listingId } = await pair();

    const added = await toggleFavorite(userId, ref);
    expect(added).toEqual({ ok: true, favorited: true });

    const row = await db.favorite.findFirst({
      where: { userId, listingId },
      select: { id: true },
    });
    if (row !== null) made.push(row.id);

    /**
     * **وعمليةٌ تقلب لا اثنتان**: زرّ القلب لا يعرف حاله قبل الضغط
     * في شبكةٍ من عشرين بطاقة، فمسارٌ يقلب يمنع «أضفتُه مرّتين».
     */
    expect(await toggleFavorite(userId, ref)).toEqual({ ok: true, favorited: false });
  });

  it('مرجعٌ مجهول يُرفض ولا يرمي', async () => {
    const { userId } = await pair();
    expect(await toggleFavorite(userId, 'ADS-NOPE-0000')).toEqual({ ok: false });
  });

  /**
   * **واستعلامٌ واحد لشبكةٍ كاملة.** سؤالٌ لكل بطاقة يجعل صفحة
   * نتائجٍ بعشرين مركبة تُطلق عشرين استعلامًا.
   */
  it('يقرأ شبكةً كاملة بمجموعةٍ واحدة', async () => {
    const { userId, ref, listingId } = await pair();
    /**
     * **والشرط يُفرَض على الثلاثة أيضًا، لا على الأوّل وحده.**
     * `pair` تضمن أن المستخدم لم يُفضّل الإعلان المعنيّ، وكان البقيّة
     * يُؤخذون بلا شرطٍ ولا ترتيب — والبذرة تصنع سبعًا وعشرين مفضّلة.
     * فيكفي أن يُغيّر زرعٌ ترتيبَ الصفوف الفعليّ ليعود إعلانٌ مفضَّلٌ
     * أصلًا فيسقط «لم يُفضّله» — ويبدو تقطّعًا وهو شرطٌ ناقص.
     */
    const mine = await db.favorite.findMany({ where: { userId }, select: { listingId: true } });
    const others = (
      await db.listing.findMany({
        where: {
          status: 'PUBLISHED',
          ref: { not: ref },
          id: { notIn: mine.map((row) => row.listingId) },
        },
        select: { ref: true },
        orderBy: { ref: 'asc' },
        take: 3,
      })
    ).map((row) => row.ref);

    const added = await toggleFavorite(userId, ref);
    expect(added).toMatchObject({ ok: true });
    /**
     * **والصفُّ يُلتقَط بإعلانه لا بصاحبه.** `findFirst({ userId })`
     * قد يعيد مفضّلةً **مزروعة** لهذا المستخدم، فيحذفها `afterAll`
     * — والاختبار يحذف ما لم يصنعه.
     */
    const row = await db.favorite.findFirst({
      where: { userId, listingId },
      select: { id: true },
    });
    if (row !== null) made.push(row.id);

    const marked = await favoritedRefs(userId, [ref, ...others]);
    expect(marked.has(ref)).toBe(true);
    for (const other of others) expect(marked.has(other)).toBe(false);

    await toggleFavorite(userId, ref);
  });

  /** والزائر بلا جلسة لا يُستعلَم له أصلًا — ولا استعلام يُطلق. */
  it('بلا مستخدم تعود مجموعةٌ فارغة', async () => {
    expect((await favoritedRefs(null, ['ADS2026A0001'])).size).toBe(0);
    expect((await favoritedRefs('someone', [])).size).toBe(0);
  });
});

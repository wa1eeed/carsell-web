import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { EMPTY_FILTERS, searchListings } from '@/lib/domain/listings';

/**
 * ═══ القلبُ على بطاقة النتيجة (Wb) ═══
 *
 * ترميز `Wb` يضع قلبَ المفضّلة فوق صورة البطاقة، **وكان في المنتج
 * موضعٌ واحد**: صفحة المركبة. فمن تصفّح عشرين نتيجة ليحفظ ثلاثًا فتح
 * عشرين صفحة ورجع عشرين مرّة.
 *
 * ويحرس هذا الملفّ ما يُبنى عليه القلب: **أنّ نتيجةَ البحث تعرف
 * محفوظَ قارئها** — وأنّ الزائر بلا جلسة لا يُحسب له شيء.
 */

/**
 * **والاختبار يصنع قارئَه.** البذرة تزرع سبعًا وعشرين مفضّلة موزّعةً
 * على حساباتها، فـ«لا بطاقةَ أخرى محفوظة» دعوى تسقط على أوّل حسابٍ
 * زُرع له محفوظ — وقد سقطت. فالقارئُ يُنشأ لهذا القياس ويُحذف بعده.
 */
const madeUsers: string[] = [];

afterAll(async () => {
  /** والمفضّلةُ تسقط مع صاحبها (`onDelete: Cascade`). */
  if (madeUsers.length > 0) await db.user.deleteMany({ where: { id: { in: madeUsers } } });
  await db.$disconnect();
});

let seq = 0;

async function reader() {
  /**
   * **ورقمان في مِلّي ثانيةٍ واحدة يتصادمان.** `Date.now()` وحدها
   * تُنتج المفتاح نفسه لقارئين يُنشآن معًا، و`phone` فريد — فيسقط
   * الاختبار متقطّعًا بحسب سرعة الجهاز. والعدّادُ يفصلهما يقينًا.
   */
  seq += 1;
  const row = await db.user.create({
    data: { phone: `+9665${String(Date.now()).slice(-6)}${String(seq)}`, name: 'قارئ قياس' },
  });
  madeUsers.push(row.id);
  return row;
}

describe('نتيجةُ البحث تعرف محفوظَ قارئها', () => {
  it('ترفع `isFavorite` للمحفوظ وحده، ولا ترفعه لغير صاحبه', async () => {
    const viewer = await reader();
    const other = await reader();

    /**
     * **والإعلانُ المحفوظ ليس إعلانَ القارئ**: البطاقة تُخفي القلب عن
     * صاحبها، فاختيارُ إعلانٍ لغيره هو ما يقيس الحقل.
     */
    const listing = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED', sellerId: { not: viewer.id } },
      select: { id: true, ref: true },
    });

    await db.favorite.create({ data: { userId: viewer.id, listingId: listing.id } });

    const mine = await searchListings({ ...EMPTY_FILTERS, limit: 60 }, 'ar', viewer.id);
    const card = mine.items.find((item) => item.ref === listing.ref);
    expect(card, 'الإعلان المحفوظ يجب أن يظهر في النتائج').toBeDefined();
    expect(card?.isFavorite).toBe(true);

    /** وسائرُ البطاقات لا ترتفع معه — وإلّا كان القلب ممتلئًا دائمًا. */
    const others = mine.items.filter((item) => item.ref !== listing.ref);
    expect(others.some((item) => item.isFavorite)).toBe(false);

    /** **ومحفوظُ غيرِك ليس محفوظَك.** */
    const theirs = await searchListings({ ...EMPTY_FILTERS, limit: 60 }, 'ar', other.id);
    expect(theirs.items.find((item) => item.ref === listing.ref)?.isFavorite).toBe(false);

    /** **والزائرُ بلا جلسة لا محفوظَ له** — ولا استعلامَ يُطلق لأجله. */
    const guest = await searchListings({ ...EMPTY_FILTERS, limit: 60 }, 'ar', null);
    expect(guest.items.every((item) => !item.isFavorite)).toBe(true);
  });
});

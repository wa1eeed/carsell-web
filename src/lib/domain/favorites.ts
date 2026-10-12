import { db } from '@/lib/db';

/**
 * ═══ المفضّلة — تُقرأ في أربعة مواضع وتُكتب في لا شيء ═══
 *
 * صفحةُ «المفضّلة» تعرضها، وبطاقةُ الحساب تعدّها، وملفُّ العميل في
 * اللوحة يعرض العدد، و**ترشيحُ الحملات يستهدف «من له مفضّلة»** —
 * ولا قلبَ في بطاقةٍ ولا في صفحة مركبة. فكلُّ ما يُعرض مصدرُه الزرع.
 *
 * رابع عشرَ موضعٍ لنمط «قيمةٌ في المخطّط بلا كاتب» — وكشفته أداةُ
 * `dead-ends` لا التصفّح.
 *
 * **وكتبتُ وعدَها بيدي قبل مهمّتين**: «بإمكانك إضافتها للمفضّلة
 * لتصلك إشعارًا» على صفحة المركبة المحجوزة — وعدٌ لميزةٍ لا وجود لها.
 */

export type FavoriteResult = { ok: true; favorited: boolean } | { ok: false };

/**
 * يضيف أو يحذف — **والعملية واحدة لا اثنتان**.
 *
 * زرّ القلب لا يعرف حاله قبل الضغط في كل حال (بطاقةٌ في شبكةٍ لا
 * تحمّل حالة كل عنصر)، فمسارٌ واحد يقلب الحال يمنع «أضفتُه مرّتين»
 * و«حذفتُ ما لم يكن».
 */
export async function toggleFavorite(
  userId: string,
  listingRef: string,
): Promise<FavoriteResult> {
  /**
   * **والمرجع لا المعرّف**: الشاشة تملك المرجع، وقبولُ المعرّف يجعل
   * العميل يرسل ما لا يراه — ولا يُقبل إلّا ما هو معروض.
   */
  const listing = await db.listing.findFirst({
    where: { ref: listingRef, status: { in: ['PUBLISHED', 'RESERVED', 'SOLD'] } },
    select: { id: true },
  });
  if (listing === null) return { ok: false };

  const existing = await db.favorite.findUnique({
    where: { userId_listingId: { userId, listingId: listing.id } },
    select: { id: true },
  });

  if (existing !== null) {
    await db.favorite.delete({ where: { id: existing.id } });
    return { ok: true, favorited: false };
  }

  await db.favorite.create({ data: { userId, listingId: listing.id } });
  return { ok: true, favorited: true };
}

/**
 * أيُّ هذه المراجع مفضَّلة؟ — **استعلامٌ واحد لشبكةٍ كاملة**.
 *
 * وسؤالٌ لكل بطاقة يجعل صفحة نتائجٍ بعشرين مركبة تُطلق عشرين استعلامًا
 * — وهو الشكل الذي يبطئ الصفحة ثم يُعالَج بذاكرةٍ وسيطة بدل أن يُمنع.
 */
export async function favoritedRefs(
  userId: string | null,
  refs: readonly string[],
): Promise<Set<string>> {
  if (userId === null || refs.length === 0) return new Set();

  /**
   * **و`Favorite` بلا علاقةٍ إلى `Listing` في المخطّط** — `listingId`
   * حقلٌ مجرَّد. فاستعلامان: المراجع إلى معرّفات، ثم المفضَّل منها.
   * (ولا تُضاف العلاقة هنا: ترحيلٌ يمسّ جدولًا قائمًا قرارٌ على حدة.)
   */
  const listings = await db.listing.findMany({
    where: { ref: { in: [...refs] } },
    select: { id: true, ref: true },
  });
  if (listings.length === 0) return new Set();

  const byId = new Map(listings.map((row) => [row.id, row.ref]));

  const rows = await db.favorite.findMany({
    where: { userId, listingId: { in: [...byId.keys()] } },
    select: { listingId: true },
  });

  return new Set(
    rows.flatMap((row) => {
      const ref = byId.get(row.listingId);
      return ref === undefined ? [] : [ref];
    }),
  );
}

/**
 * ═══ أيُّ هذه الإعلانات لك؟ ═══
 *
 * الشاشة تعرض بطاقاتٍ لا تقول لمن هي. ومن نشر سيارته يراها في البحث
 * وفي الرئيسية **كأيّ بطاقة**، فيفتحها ويضغط «اشترِ» — ويردّ الخادم
 * `OWN_LISTING`. والحارس صحيح، **والشاشة لم تقل**.
 *
 * ولا يُحلّ بقراءة `sellerId` في كل شاشة: أربع شاشاتٍ تبني بطاقات،
 * وأربع نسخٍ من الشرط تتباعد. فاستعلامٌ واحد كـ`favoritedRefs`.
 */
export async function ownListingRefs(
  userId: string | null,
  refs: readonly string[],
): Promise<Set<string>> {
  if (userId === null || refs.length === 0) return new Set();

  const rows = await db.listing.findMany({
    where: { ref: { in: [...refs] }, sellerId: userId },
    select: { ref: true },
  });

  return new Set(rows.map((row) => row.ref));
}

import type { db } from '@/lib/db';

/**
 * ═══ حالة الإعلان — تُكتب من هنا وحدها ═══
 *
 * كان لحالة الإعلان ستّة كتّاب متفرّقين، فتباعدوا كما يتباعد كل ما
 * يُنسخ: `orders.ts` و`auction-order.ts` يكتبان `RESERVED` **بلا**
 * `closedAt` ولا `closeReason`، و`offers.ts` يكتب الثلاثة. فصفٌّ
 * محجوزٌ لا يُعرف متى حُجز ولا لماذا، وآخرُ يُعرف — والفرق ليس قرارًا
 * بل أثرَ نسخٍ لم يكتمل.
 *
 * ═══ وما كشف الحاجة إليه ═══
 *
 * **الإعلان لم يكن يصير `SOLD` أبدًا.** الطلب يكتمل، ويصير
 * `COMPLETED`، ويصدر عقد البيع — والإعلان يبقى `RESERVED` إلى الأبد.
 * فعدّاد «المُباع هذا الشهر» في اللوحة يقرأ `status: 'SOLD'` ويجد
 * **صفرًا دائمًا**، وصفحة المزادات تعرض ما بيع.
 *
 * ثم وقع الصنف نفسه ثانيةً: نزاعٌ يُحسم بـ`FULL_REFUND` يُلغي الطلب
 * ويترك الإعلان محجوزًا — فمركبةٌ لم تُبَع لا تعود إلى السوق ولا
 * يعرف صاحبها لماذا.
 *
 * ومرّتان تعنيان بوابةً لا إصلاحين: **البوابة ٢١** تمنع كتابة
 * `status` على `listing` خارج هذا الملف.
 *
 * ═══ ولماذا لا تفحص هذه الدوالّ الحالة السابقة ═══
 *
 * صاحب الحقيقة هو آلة حالات الطلب، لا الإعلان. وفحصٌ مزدوج هنا
 * يُنتج رفضًا صامتًا داخل معاملةٍ نجحت — فالطلب يكتمل والإعلان لا
 * يتبعه، وهو العطل نفسه بوجهٍ ألطف. عدا `sendToReview`: شرطُه جزءٌ
 * من معناه (المنشور وحده يُحال).
 */

/** يقبل `tx` أو `db` — فتُكتب الحالة داخل معاملة الحدث لا بعدها. */
type Writer = Pick<typeof db, 'listing'>;

/**
 * **وكاتبٌ أوسع لمن يُخطِر معه.** `Writer` ضيّقٌ عمدًا: هذا الملفّ
 * يكتب حالة الإعلان ولا شيء غيرها. و`sendListingToReview` وحدها
 * تُرسل إشعارًا في المعاملة نفسها — فتطلب كاتبًا يسع `notification`،
 * ولا تُوسَّع به بقيّةُ الملفّ.
 */
type NotifyingWriter = Writer & Pick<typeof db, 'notification'>;

/**
 * لماذا أُغلق الإعلان — مفتاحٌ لاتينيّ تصوغه `src/lib/labels/`.
 *
 * والسبب يُخزَّن لأن الحالة وحدها لا تكفي: `RESERVED` تقول «محجوز»
 * ولا تقول أبيعٌ مباشر أم عرضٌ قُبل أم مزادٌ رسا — وهي ثلاثة مسارات
 * تُقرأ بعد شهور في تحقيقٍ أو نزاع.
 */
export type ReserveReason =
  | 'order.created'
  | 'offer.accepted'
  | 'auction.won'
  /** «اشترِ الآن» — المزاد لم يرسُ، بل اشتُريت المركبة بسعرٍ معلَن */
  | 'auction.buy_now';

/** حُجز لطلبٍ قائم — ويخرج من العرض العام. */
export async function reserveListing(
  writer: Writer,
  listingId: string,
  reason: ReserveReason,
  now: Date = new Date(),
): Promise<void> {
  await writer.listing.update({
    where: { id: listingId },
    data: { status: 'RESERVED', closedAt: now, closeReason: reason },
  });
}

/**
 * بِيع — **عند تأكيد نقل الملكية لا عند الدفع**.
 *
 * والفرق ليس تفصيلًا: بين الدفع والنقل مهلةٌ يُلغى فيها الطلب ويعود
 * الإعلان، فإعلانُ البيع عند الدفع يقول «بِيعت» لمركبةٍ قد ترجع.
 */
export async function markListingSold(
  writer: Writer,
  listingId: string,
  now: Date = new Date(),
): Promise<void> {
  await writer.listing.update({
    where: { id: listingId },
    data: { status: 'SOLD', closedAt: now, closeReason: 'order.completed' },
  });
}

/**
 * يعود إلى العرض العام — بعد مهلةٍ انقضت، أو نزاعٍ رُدّ فيه المال.
 *
 * و`closedAt` و`closeReason` يُمحيان: صفٌّ منشورٌ يحمل سبب إغلاقٍ
 * قديم يُقرأ لاحقًا على أنه مغلق.
 */
export async function republishListing(writer: Writer, listingId: string): Promise<void> {
  await writer.listing.update({
    where: { id: listingId },
    data: { status: 'PUBLISHED', closedAt: null, closeReason: null },
  });
}

/**
 * ═══ إيقاف البائع لإعلانه — ورفعُه ═══
 *
 * **و`PAUSED` ليست `SUSPENDED`.** الثانية عقوبةٌ يوقعها الأدمن، ولو
 * خُلطتا لرفع البائع عقوبتَه بضغطة «أعِد عرضه». والزائر لا يرى الإعلان
 * في الحالين، فالفرق غير مرئيّ — ولذلك بالضبط يُكتب في الحالة نفسها.
 *
 * **ولا تُكتب `closeReason`**: الإيقاف المؤقّت ليس خروجًا من السوق،
 * والإعلان يعود بحاله وسعره وتاريخ نشره ومشاهداته.
 */
export async function pauseListing(writer: Writer, listingId: string): Promise<void> {
  await writer.listing.update({
    where: { id: listingId },
    data: { status: 'PAUSED' },
  });
}

/**
 * يعود معروضًا بعد إيقاف صاحبه — **ومن `PAUSED` وحدها**.
 *
 * الشرط في `seller-listing.ts` قبل النداء، وهذه هي الكتابة. وفصلُهما
 * مقصود: الحالة تمرّ من هنا، والصلاحية تُفحص هناك.
 */
export async function resumeListing(writer: Writer, listingId: string): Promise<void> {
  await writer.listing.update({
    where: { id: listingId },
    data: { status: 'PUBLISHED' },
  });
}

/**
 * يخرج من السوق ولا يعود وحده — بعد ردٍّ كاملٍ وقع **بعد نقل الملكية**.
 *
 * والمركبة حينئذٍ بيد المشتري ولا نعرف أين استقرّت، فنشرُها وعدٌ لا
 * نملك الوفاء به. وإبقاؤها `RESERVED` كذبٌ آخر: الحجز لطلبٍ أُلغي.
 *
 * DESIGN-Q: هذه الحالة **بلا باب**. لا شاشة البائع (`/account/listings`
 * للقراءة فقط) ولا لوحة الأدمن (لا شاشة إعلانات أصلًا) تستطيع إخراج
 * إعلانٍ منها. فاخترتُها لأنها أصدق الحالات المتاحة، لا لأنها كاملة.
 */
export async function suspendListing(
  writer: Writer,
  listingId: string,
  reason: 'dispute.refunded' | 'review.rejected',
  now: Date = new Date(),
): Promise<void> {
  await writer.listing.update({
    where: { id: listingId },
    data: { status: 'SUSPENDED', closedAt: now, closeReason: reason },
  });
}

/**
 * يعود مسودّةً عند صاحبه بعد مراجعة — **بملاحظةٍ يقرؤها**.
 *
 * وإرجاعٌ بلا سببٍ مكتوب إرجاعٌ صامت: يجد البائع عمله مردودًا ولا
 * يعرف ماذا يُصلح، فيعيد نشره كما هو فيعود إلى الطابور — ودورةٌ لا
 * تنتهي بين الطرفين. فالملاحظة جزءٌ من الانتقال لا زينةٌ بجانبه.
 */
export async function returnListingToSeller(
  writer: Writer,
  listingId: string,
  stamp: { note: string; adminId: string },
  now: Date = new Date(),
): Promise<void> {
  await writer.listing.update({
    where: { id: listingId },
    data: {
      status: 'DRAFT',
      publishedAt: null,
      reviewNote: stamp.note,
      reviewedAt: now,
      reviewedBy: stamp.adminId,
    },
  });
}

/** اعتُمد بعد مراجعة — **والراية تُمحى** وإلّا عاد إلى الطابور. */
export async function approveReviewedListing(
  writer: Writer,
  listingId: string,
  stamp: { adminId: string },
  now: Date = new Date(),
): Promise<void> {
  await writer.listing.update({
    where: { id: listingId },
    data: {
      status: 'PUBLISHED',
      publishedAt: now,
      closedAt: null,
      closeReason: null,
      reviewReason: null,
      reviewedAt: now,
      reviewedBy: stamp.adminId,
    },
  });
}

/**
 * بلاغٌ أحاله إلى المراجعة — **والمنشور وحده يُحال**.
 *
 * ويعيد `false` إن لم يكن منشورًا: بلاغان على إعلانٍ واحد يجب ألّا
 * يُنتجا إحالتين، ومحجوزٌ أو مباعٌ لا يُسحب من تحت طلبٍ قائم.
 */
export async function sendListingToReview(
  writer: NotifyingWriter,
  listingId: string,
  reviewReason: 'USER_REPORT',
  now: Date = new Date(),
): Promise<boolean> {
  const { count } = await writer.listing.updateMany({
    where: { id: listingId, status: 'PUBLISHED' },
    // لحظة دخول الطابور — وبدونها لا يُقاس انتظارُ صاحبه
    data: { status: 'PENDING_REVIEW', reviewReason, reviewQueuedAt: now },
  });
  if (count === 0) return false;

  /**
   * ═══ وإعلانٌ سُحب من السوق يُقال لصاحبه ═══
   *
   * **بلاغٌ يُحيل إعلانًا منشورًا إلى المراجعة فيختفي من السوق** —
   * ولا شيء كان يقول لصاحبه. فيرى مشاهداته تتوقّف وعروضه تنقطع ويظنّ
   * السوق كاسدًا، وهو موقوفٌ ينتظر مراجعًا.
   *
   * **والإشعار هنا لا عند مُنادِيها**: الدالّة تُنادى من موضعين
   * (بلاغُ مستخدم وقرارُ أدمن)، ونسختان تتباعدان أوّل تعديل.
   *
   * ولا سبب يُمرَّر: البلاغ نصُّ غيرِه، وإرسالُه إلى المبلَّغ عنه
   * يكشف مُبلِّغَه ويفتح بابًا للانتقام.
   */
  const listing = await writer.listing.findUnique({
    where: { id: listingId },
    select: { ref: true, sellerId: true },
  });
  if (listing === null) return true;

  const { notify } = await import('./notifications');
  await notify(
    {
      userId: listing.sellerId,
      templateKey: 'listing.under_review',
      priority: 'high',
      payload: { ref: listing.ref },
      entityType: 'Listing',
      entityId: listingId,
    },
    writer,
  );

  return true;
}

/**
 * ═══ حذفُ إعلانٍ لم يره أحد ═══
 *
 * البائع يستطيع **الإيقاف** و**التعديل** — ولا يستطيع الحذف. فمن
 * بدأ إعلانًا ثمّ عدل عنه تبقى مسودّتُه في «إعلاناتي» إلى الأبد، ولا
 * زرَّ يُزيلها. وصفحةُ «تنتظرك» تعرضها بعدّادها فتقول له كلّ مرّة
 * إنّ عليه عملًا لا يريده.
 *
 * ═══ وما يُحذف غير ما يُوقَف ═══
 *
 * | الحال | ما يقع |
 * |---|---|
 * | مسودّة · قيد المراجعة | **يُحذف** — لم يره زائر، ولا عرضَ عليه |
 * | منشور · موقوف | **يُوقَف** ولا يُحذف — رآه الناس وقد يكون عليه عرض |
 * | محجوز · مباع · موقوف إداريًّا | لا هذا ولا ذاك — له أثرٌ ماليّ |
 *
 * **والسجلّ لا يُمحى**: عرضٌ أو طلبٌ أو مزادٌ على الإعلان يمنع الحذف
 * (`onDelete: Restrict` في المخطّط يحرسه أيضًا) — فمن تفاوض عليه
 * يبقى تفاوضُه مقروءًا بعد أن يُوقف البائع إعلانه.
 *
 * **والصورة تُحذف معه**: `ListingImage` تتالى بالحذف، وبصمتُها
 * (`phash`) تُقرأ في كشف التكرار — فصورةٌ يتيمة لإعلانٍ هُجر تُطلق
 * إنذارًا كاذبًا على بائعٍ آخر بعد شهور.
 *
 * **ولا تمرّ بالبوابة ٢١**: هي لا تكتب `status` بل تمحو الصفّ.
 */
export type DeleteListingFailure =
  | 'NOT_FOUND'
  | 'NOT_OWNER'
  | 'PUBLISHED_PAUSE_INSTEAD'
  | 'HAS_HISTORY';

const DELETABLE = ['DRAFT', 'PENDING_REVIEW'] as const;

export async function deleteListing(
  input: { ref: string; sellerId: string },
): Promise<{ ok: true } | { ok: false; reason: DeleteListingFailure }> {
  const { db: database } = await import('@/lib/db');

  const listing = await database.listing.findUnique({
    where: { ref: input.ref },
    select: {
      id: true,
      sellerId: true,
      status: true,
      _count: { select: { offers: true, orders: true, serviceRequests: true } },
      auction: { select: { id: true } },
    },
  });

  if (listing === null) return { ok: false, reason: 'NOT_FOUND' };
  if (listing.sellerId !== input.sellerId) return { ok: false, reason: 'NOT_OWNER' };
  if (!(DELETABLE as readonly string[]).includes(listing.status)) {
    return { ok: false, reason: 'PUBLISHED_PAUSE_INSTEAD' };
  }
  /**
   * **والأثر يُفحص ولو منعه المخطّط.** القيد الأجنبيّ يرمي استثناءً
   * غامضًا، والفحص هنا يُعيد سببًا تقرؤه الشاشة.
   */
  if (
    listing._count.offers > 0 ||
    listing._count.orders > 0 ||
    listing._count.serviceRequests > 0 ||
    listing.auction !== null
  ) {
    return { ok: false, reason: 'HAS_HISTORY' };
  }

  await database.listing.delete({ where: { id: listing.id } });
  return { ok: true };
}

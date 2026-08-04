/**
 * تنظيف ما تركه تشغيل فاشل — **مرّة قبل كل تشغيل**.
 *
 * `afterAll` لا يجري حين يرمي التأكيد قبله، فأدمنُ اختبارٍ يبقى في
 * قاعدة التطوير ويظهر في «الفريق والصلاحيات» كأنه موظّف. وهذا وقع
 * فعلًا: ستّة حسابات باسم «محرّر» من تشغيلات فشلت.
 *
 * والمسح مقصور على النمط `<بادئة><طابع زمني>@carsell.one` — والحسابات
 * المزروعة أسماؤها كلمات بلا أرقام، فلا تُمَسّ.
 */
/**
 * النمط لا القائمة: **حروف ثم طابع زمني** هو شكل كل بريد يولّده اختبار،
 * أيًّا كانت بادئته. وقائمة بادئات تُنسى واحدةٌ منها فتتراكم عشرات
 * الحسابات بلا أن يلاحظها أحد — وقد تراكمت ثمانية عشر فعلًا.
 *
 * والحسابات المزروعة كلماتٌ بلا أرقام (`super` · `ops` · `finance`).
 */
const TEST_EMAIL = /^[a-z]{1,8}\d{6,}@carsell\.one$/;

/**
 * ═══ والإعلانات تتسرّب مثلها ═══
 *
 * كل إعلانٍ يصنعه اختبار مرجعُه **بادئةٌ ثم طابع زمني**: `AUC…` `DSP…`
 * `INB…` `TST…`. والمزروع `ADS2026A0001` — حرفٌ بين أرقامه فلا يطابق.
 *
 * وقد تسرّب **مئةٌ وعشرة** إعلانات عبر تشغيلاتٍ متتابعة، كلّها منشورة
 * في جدة، فصارت تُضخّم عدّادات صفحات الهبوط وتُزيّف كل قياسٍ للسوق. ولم
 * يلاحظها أحد لأن لا اختبار يسأل «كم إعلانًا في القاعدة».
 */
const TEST_LISTING_REF = /^[A-Z]{3}\d{9,}$/;
const TEST_ORDER_REF = /^ORD-(TST|RPT)-/;
const TEST_SERVICE_REF = /^SRV-[A-Z]-/;

export default async function globalSetup(): Promise<void> {
  // `globalSetup` يسبق `setupFiles` — فالبيئة تُحمَّل هنا أيضًا لا هناك وحدها
  try {
    process.loadEnvFile();
  } catch {
    // المتغيّرات من البيئة نفسها
  }

  const { db } = await import('@/lib/db');

  const candidates = await db.adminUser.findMany({ select: { id: true, email: true } });
  const ids = candidates.filter((row) => TEST_EMAIL.test(row.email)).map((row) => row.id);

  /**
   * والتحقّق الحيّ يكتب صفوفًا أيضًا — **فيُنظَّف آليًّا لا انضباطًا**.
   *
   * طلب تبديل بوابة تركتُه معلّقًا في تحقّقٍ يدويّ أسقط اختبارين في
   * التشغيل التالي: الاختبار كان محقًّا، والبيانات هي المتّسخة.
   */
  const stalePending = await db.approvalRequest.deleteMany({
    where: { kind: { in: ['PAYMENT_ROUTE', 'KEY_ROTATION', 'INTEGRATION_ENV'] }, status: 'PENDING' },
  });
  if (stalePending.count > 0) {
    console.log(`  نُظّف ${String(stalePending.count)} طلب موافقة معلّق من تحقّق سابق`);
  }

  /**
   * الإعلانات المتسرّبة وما تعلّق بها — بالترتيب الذي تسمح به القيود:
   * المزايدات ثم المزاد ثم الإعلان ثم المركبة. والمركبة تُحذف لأنها
   * صُنعت للاختبار وحده ولا تُشير إليها غيرها.
   */
  const listings = await db.listing.findMany({ select: { id: true, ref: true, vehicleId: true } });
  const stale = listings.filter((row) => TEST_LISTING_REF.test(row.ref));
  if (stale.length > 0) {
    const listingIds = stale.map((row) => row.id);
    const auctions = await db.auction.findMany({
      where: { listingId: { in: listingIds } },
      select: { id: true },
    });
    const auctionIds = auctions.map((row) => row.id);

    await db.bid.deleteMany({ where: { auctionId: { in: auctionIds } } });
    await db.deposit.deleteMany({ where: { auctionId: { in: auctionIds } } });
    await db.auction.deleteMany({ where: { id: { in: auctionIds } } });

    /**
     * كل ما يشير إلى الإعلان — والقائمة من المخطّط لا من الذاكرة:
     * `Auction` · `Favorite` · `ListingFeature` · `ListingImage` ·
     * `Offer` · `Order` · `ServiceRequest`. وواحدٌ منسيّ يُسقط الحذف
     * بقيد أجنبيّ فيبقى التسرّب كما كان.
     */
    const linkedOrders = await db.order.findMany({
      where: { listingId: { in: listingIds } },
      select: { id: true },
    });
    const linkedOrderIds = linkedOrders.map((row) => row.id);
    if (linkedOrderIds.length > 0) {
      await db.orderEvent.deleteMany({ where: { orderId: { in: linkedOrderIds } } });
      await db.escrow.deleteMany({ where: { orderId: { in: linkedOrderIds } } });
      await db.dispute.deleteMany({ where: { orderId: { in: linkedOrderIds } } });
      await db.paymentEvent.deleteMany({ where: { payment: { orderId: { in: linkedOrderIds } } } });
      await db.payment.deleteMany({ where: { orderId: { in: linkedOrderIds } } });
      await db.order.deleteMany({ where: { id: { in: linkedOrderIds } } });
    }

    await db.offer.deleteMany({ where: { listingId: { in: listingIds } } });
    await db.serviceRequest.deleteMany({ where: { listingId: { in: listingIds } } });
    await db.listingImage.deleteMany({ where: { listingId: { in: listingIds } } });
    await db.listingFeature.deleteMany({ where: { listingId: { in: listingIds } } });
    await db.favorite.deleteMany({ where: { listingId: { in: listingIds } } });
    await db.listing.deleteMany({ where: { id: { in: listingIds } } });
    await db.vehicle.deleteMany({ where: { id: { in: stale.map((row) => row.vehicleId) } } });

    console.log(`  نُظّف ${String(stale.length)} إعلان اختبار من تشغيلات سابقة`);
  }

  const orders = await db.order.findMany({ select: { id: true, ref: true } });
  const staleOrders = orders.filter((row) => TEST_ORDER_REF.test(row.ref)).map((row) => row.id);
  if (staleOrders.length > 0) {
    await db.orderEvent.deleteMany({ where: { orderId: { in: staleOrders } } });
    await db.escrow.deleteMany({ where: { orderId: { in: staleOrders } } });
    await db.order.deleteMany({ where: { id: { in: staleOrders } } });
    console.log(`  نُظّف ${String(staleOrders.length)} طلب اختبار من تشغيلات سابقة`);
  }

  const requests = await db.serviceRequest.findMany({ select: { id: true, ref: true } });
  const staleRequests = requests.filter((row) => TEST_SERVICE_REF.test(row.ref)).map((r) => r.id);
  if (staleRequests.length > 0) {
    await db.inspectionReport.deleteMany({ where: { serviceRequestId: { in: staleRequests } } });
    await db.serviceRequest.deleteMany({ where: { id: { in: staleRequests } } });
    console.log(`  نُظّف ${String(staleRequests.length)} طلب خدمة من تشغيلات سابقة`);
  }

  if (ids.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.adminSession.deleteMany({ where: { adminUserId: { in: ids } } });
    await db.adminUser.deleteMany({ where: { id: { in: ids } } });
    console.log(`  نُظّف ${String(ids.length)} حساب اختبار من تشغيل سابق`);
  }

  await db.$disconnect();
}

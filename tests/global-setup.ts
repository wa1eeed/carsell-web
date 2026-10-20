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
/**
 * ═══ ومواعيدُ المعاينة تُبنى بالمولِّد الحقيقيّ ═══
 *
 * فلا بادئةَ تميّزها (`VIW-2026-NNNN` كالمزروع تمامًا) — **والبذرةُ
 * تزرع ستّة بالضبط**، وما جاوزها أثرُ تشغيلٍ أو مشيٍ يدويّ. والحذفُ
 * هنا خطر: المشيُ بالنقر يُنشئ صفوفًا حقيقية أُريد بقاءها.
 *
 * فيُقاس ولا يُحذف — **والتسرّب الصامت يُقاس لا يُلاحَظ** — ويُنظَّف
 * بـ`npm run trial:reset` حين يُراد.
 */
const SEEDED_VIEWINGS = 7;

/**
 * ═══ وحملات الإعلان تتسرّب مثلها ═══
 *
 * اسم المعلن في الاختبار «معلن ‹طابع زمنيّ›» — والحقيقيّ اسمُ شركة.
 * وحملةٌ متسرّبة تُعرض في نتائج البحث للزائر **وتَعُدّ ظهورًا**، أي
 * تُفسد بندَ إيرادٍ لا عدّادَ عرضٍ فحسب.
 */
const TEST_ADVERTISER = /\d{9,}/;

/** مزوّدٌ صنعه اختبار — الطابع في اسمه اللاتينيّ، كما في المعلن. */
const TEST_PROVIDER = /\d{9,}/;

/**
 * ═══ وحسابات المستخدمين تتسرّب مثلها — ومعها إشعاراتها ═══
 *
 * الهاتف السعوديّ في E.164 ثلاثةَ عشر حرفًا: `+966` ثمّ تسعة. والاختبار
 * يبني هاتفه من طابعٍ زمنيّ فيطول إلى سبعةَ عشر — فالشكل يفرّق بلا وسمٍ
 * يُضاف ولا عمودٍ يُستحدث.
 *
 * **وقد تسرّب خمسُمئة وثمانيةٌ وأربعون حسابًا** عبر تشغيلاتٍ متتابعة،
 * وعليها **تسعُمئة وتسعة إشعارات** مقابل سبعةَ عشر على المزروعين — أي
 * أنّ ثمانيةً وتسعين في المئة ممّا في الجدول ظلٌّ لا يقرؤه أحد. ولم
 * يكشفها شيء لأن `User` لم يكن يُنظَّف أصلًا.
 */
const TEST_USER_PHONE = /^\+9665\d{11,}$/;

/**
 * ═══ والتنظيف يقع في الطرفين لا في البداية وحدها ═══
 *
 * كان يُنادى قبل التشغيل فقط، فيخرج التشغيل تاركًا ما صنعه إلى أن يبدأ
 * الذي بعده. وبين التشغيلين **قاعدةُ التطوير هي ما يراه المالك**:
 * قِيس فوُجد فيها أحدَ عشرَ حساب أدمن ثلاثةٌ منها حقيقية، وفي الثمانية
 * **سوبر أدمن** — و«الفريق والصلاحيات» يعرضها كلَّها كأنها موظّفون.
 *
 * وتسعةُ ملفّات تصنع أدمن بلا `afterAll` — فهذه فئةٌ لا حالات، وموضع
 * إغلاقها واحد. و`globalSetup` في vitest تُعيد دالّة تفكيك.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  // `globalSetup` يسبق `setupFiles` — فالبيئة تُحمَّل هنا أيضًا لا هناك وحدها
  try {
    process.loadEnvFile();
  } catch {
    // المتغيّرات من البيئة نفسها
  }

  await sweep('من تشغيلات سابقة');
  return () => sweep('بعد التشغيل');
}

async function sweep(when: string): Promise<void> {
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
    where: {
      kind: {
        in: [
          'PAYMENT_ROUTE',
          'KEY_ROTATION',
          'INTEGRATION_ENV',
          'SELLER_PAYOUT',
          /** **وأثرٌ جديد يُضاف إلى الاستعادة المشتركة** في يومه. */
          'PROVIDER_PAYOUT',
        ],
      },
      status: 'PENDING',
    },
  });

  /**
   * **وتحويلٌ معلَّق من مشيٍ يدويّ يمنع طلبًا ثانيًا** لصاحبه
   * (`ALREADY_PENDING`) — فيسقط اختبارُ النصاب على ما لم يصنعه.
   *
   * **وما وسمته البذرة يُستثنى** — كما في تحويل المزوّد تمامًا. وكان
   * الاستثناءُ هناك وحده، فاختفى طلبُ البائع المزروع بعد أوّل تشغيل
   * وعادت الشاشةُ بلا قسمِ «ينتظر مرجع الحوالة» في بيئةٍ تُزرع لتُعرض.
   * **وأثرٌ جديد يُتبَع في الاستعادة المشتركة مرّة** — وهذه ثانيتُه.
   */
  const stalePayouts = await db.payout.deleteMany({
    where: { status: 'PENDING', NOT: { note: 'seed' } },
  });
  if (stalePayouts.count > 0) {
    console.log(`  نُظّف ${String(stalePayouts.count)} تحويلًا معلَّقًا من تحقّق سابق`);
  }

  /**
   * ومثلُه تحويلُ المزوّد — و`ALREADY_PENDING` تحرسه بالقاعدة نفسها.
   *
   * **وما وسمته البذرة يُستثنى**: الحذفُ بالشكل لا يفرّق بين بقايا
   * مشيٍ يدويّ وصفٍّ زُرع ليُرى، فكان طلبُ البذرة المنتظر يختفي بعد
   * أوّل تشغيل — وشاشةُ الصرف تعود بلا قسمِ «ينتظر اعتماد عضوٍ ثانٍ»
   * في بيئةٍ تُزرع لتُعرض.
   */
  const staleProviderPayouts = await db.providerPayout.deleteMany({
    where: { status: 'PENDING', NOT: { note: 'seed' } },
  });
  if (staleProviderPayouts.count > 0) {
    console.log(
      `  نُظّف ${String(staleProviderPayouts.count)} تحويل مزوّد معلَّقًا من تحقّق سابق`,
    );
  }
  if (stalePending.count > 0) {
    console.log(`  نُظّف ${String(stalePending.count)} طلب موافقة معلّق من تحقّق سابق`);
  }

  /**
   * **ومزوّدٌ صنعه اختبارٌ يضخّم عدّادات شاشةٍ كاملة.** «مزوّدون نشطون»
   * و«يغطّون ن مدينة» و«خدمات مرتبطة» كلُّها تُحسب من الصفوف، فبقايا
   * تشغيلٍ مقتول تُغيّر أرقامًا يقرؤها المشغّل على أنها حالُ السوق.
   */
  /**
   * **وسؤالٌ صنعه اختبارٌ يصل الزائر.** بنك الأسئلة يُقرأ في صفحة
   * السيارة والرئيسية والمساعدة، وعدّادُ «ترجمة ناقصة» يُحسب من الصفوف
   * — فبقايا تشغيلٍ مقتول تظهر للناس وتضخّم رقمًا يقرؤه المحرّر.
   */
  const faqs = await db.faqItem.findMany({ select: { id: true, questionEn: true } });
  const staleFaqs = faqs.filter((row) => TEST_PROVIDER.test(row.questionEn));
  if (staleFaqs.length > 0) {
    const ids = staleFaqs.map((row) => row.id);
    await db.faqPlacement.deleteMany({ where: { faqId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await db.faqItem.deleteMany({ where: { id: { in: ids } } });
    console.log(`  نُظّف ${String(staleFaqs.length)} سؤال اختبار ${when}`);
  }

  const providers = await db.serviceProvider.findMany({ select: { id: true, nameEn: true } });
  const staleProviders = providers.filter((row) => TEST_PROVIDER.test(row.nameEn));
  if (staleProviders.length > 0) {
    const ids = staleProviders.map((row) => row.id);
    await db.serviceRequest.updateMany({ where: { providerId: { in: ids } }, data: { providerId: null } });
    await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    /**
     * **وتحويلاتُه تُحذف قبله**: `ProviderPayout → ServiceProvider`
     * بـ`onDelete: Restrict`، فمزوّدُ اختبارٍ صُرف له يمنع حذفَ نفسه —
     * ويسقط التنظيفُ كلُّه على قيدٍ أجنبيّ، لا هذا السطر وحده.
     */
    await db.providerPayout.deleteMany({ where: { providerId: { in: ids } } });
    /**
     * **وقيودُه في الدفتر تُحذف بمعاملتها لا بمعرّفه**: قيدٌ باسمه
     * يقابله قيدٌ على حسابنا بلا اسم، وحذفُ طرفٍ واحد يترك في الدفتر
     * معاملةً **غير متوازنة** تُسقط كل اختبارٍ يفحص التوازن.
     */
    const providerEntries = await db.ledgerEntry.findMany({
      where: { providerId: { in: ids } },
      select: { txnId: true },
    });
    const transactions = [...new Set(providerEntries.map((row) => row.txnId))];
    if (transactions.length > 0) {
      await db.ledgerEntry.deleteMany({ where: { txnId: { in: transactions } } });
    }
    await db.serviceProvider.deleteMany({ where: { id: { in: ids } } });
    console.log(`  نُظّف ${String(staleProviders.length)} مزوّد اختبار ${when}`);
  }

  const campaigns = await db.adCampaign.findMany({ select: { id: true, advertiserName: true } });
  const staleAds = campaigns.filter((row) => TEST_ADVERTISER.test(row.advertiserName));
  if (staleAds.length > 0) {
    const ids = staleAds.map((row) => row.id);
    await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await db.adCampaign.deleteMany({ where: { id: { in: ids } } });
    console.log(`  نُظّفت ${String(staleAds.length)} حملة إعلان ${when}`);
  }

  /**
   * الإعلانات المتسرّبة وما تعلّق بها — بالترتيب الذي تسمح به القيود:
   * المزايدات ثم المزاد ثم الإعلان ثم المركبة. والمركبة تُحذف لأنها
   * صُنعت للاختبار وحده ولا تُشير إليها غيرها.
   */
  const listings = await db.listing.findMany({ select: { id: true, ref: true, vehicleId: true } });
  /**
   * ═══ وما يمرّ بمولِّد المراجع لا يُعرَف بشكل مرجعه ═══
   *
   * القاعدة أعلاه تُمسك ما يصنعه اختبارٌ بيده (`AUC…` + طابع زمني).
   * **وطقمُ النشر يمرّ بـ`createListing` نفسها**، فمرجعُه متسلسل
   * (`ADS2026A0062`) **لا يفرّقه شكلٌ عن المزروع** — فتسرّبت منه
   * ثلاثون في تشغيلاتٍ متتابعة، وأحدُها لبائعٍ آخر: فصار كشفُ
   * التكرار يرى صورةَ الطقم تكرارًا، وسقط اختباران على ما لا
   * يقيسانه.
   *
   * فالشكلُ هنا **الصورة لا المرجع**: كل إعلانٍ يحمل صورةً مفتاحُها
   * `probe/` صنعه اختبار. والقاعدة تتبع المصدر لا الاسم.
   */
  const probeImages = await db.listingImage.findMany({
    where: { r2Key: { startsWith: 'probe/' } },
    select: { listingId: true },
  });
  const fromProbe = new Set(probeImages.map((row) => row.listingId));
  const stale = listings.filter(
    (row) => TEST_LISTING_REF.test(row.ref) || fromProbe.has(row.id),
  );
  if (stale.length > 0) {
    const listingIds = stale.map((row) => row.id);
    const auctions = await db.auction.findMany({
      where: { listingId: { in: listingIds } },
      select: { id: true },
    });
    const auctionIds = auctions.map((row) => row.id);

    await db.bid.deleteMany({ where: { auctionId: { in: auctionIds } } });
    /**
     * **ودفعة العربون تتبع صفَّه.** صار الحجز يُنشئ `Payment`، فحذفُ
     * العربون وحده يترك دفعةً يتيمة تُضخّم «محجوز الآن» في كل تشغيل.
     */
    const depositRows = await db.deposit.findMany({
      where: { auctionId: { in: auctionIds } },
      select: { paymentId: true },
    });
    const depositPayments = depositRows
      .map((row) => row.paymentId)
      .filter((id): id is string => id !== null);

    await db.deposit.deleteMany({ where: { auctionId: { in: auctionIds } } });
    if (depositPayments.length > 0) {
      await db.payment.deleteMany({ where: { id: { in: depositPayments } } });
    }
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

    console.log(`  نُظّف ${String(stale.length)} إعلان اختبار ${when}`);
  }

  const orders = await db.order.findMany({ select: { id: true, ref: true } });
  const staleOrders = orders.filter((row) => TEST_ORDER_REF.test(row.ref)).map((row) => row.id);
  if (staleOrders.length > 0) {
    await db.orderEvent.deleteMany({ where: { orderId: { in: staleOrders } } });
    await db.escrow.deleteMany({ where: { orderId: { in: staleOrders } } });
    await db.order.deleteMany({ where: { id: { in: staleOrders } } });
    console.log(`  نُظّف ${String(staleOrders.length)} طلب اختبار ${when}`);
  }

  /**
   * ═══ وإشعارُ طلبٍ لم يعد موجودًا ═══
   *
   * **التسرّب الصامت يُقاس لا يُلاحَظ.** صارت رحلةُ الطلب تُخطِر
   * طرفيها، واختبارٌ يُنشئ طلبًا جديدًا (لا يمرّ بـ`withOrder`) ثم
   * يُحذف صفُّه يترك إشعاراته خلفه — **ولا قيدَ أجنبيّ يمنع**:
   * `entityId` نصٌّ لا مرجع، فلا شيء يسقط ولا شيء يقول.
   *
   * وقِيس: اثنا عشر صفًّا لطلبٍ واحد بعد تشغيلٍ واحد. والتنظيف
   * بالشكل — كل إشعار طلبٍ لا يقابله صفٌّ قائم يتيمٌ يُحذف.
   */
  const bells = await db.notification.findMany({
    where: { entityType: { not: null } },
    select: { id: true, entityType: true, entityId: true },
  });
  if (bells.length > 0) {
    /**
     * **وكلُّ كيانٍ لا كيانَ الطلب وحده.** قِيس بالنقر: إشعارُ
     * «بدأ مزاد مركبةٍ حفظتها» يصل بلا رابط — لأن المزاد الذي يشير
     * إليه حُذف في إعادة زرع. والتنظيف كان يعرف `Order` وحدها، فنجا
     * كلُّ ما عداها.
     *
     * والقائمة من المخطّط لا من الذاكرة، وواحدٌ منسيٌّ يُبقي التسرّب.
     */
    const live = new Map<string, Set<string>>([
      ['Order', new Set((await db.order.findMany({ select: { ref: true } })).map((r) => r.ref))],
      ['Auction', new Set((await db.auction.findMany({ select: { id: true } })).map((r) => r.id))],
      ['Listing', new Set((await db.listing.findMany({ select: { id: true } })).map((r) => r.id))],
      ['Offer', new Set((await db.offer.findMany({ select: { id: true } })).map((r) => r.id))],
      ['Dispute', new Set((await db.dispute.findMany({ select: { id: true } })).map((r) => r.id))],
      [
        'ServiceRequest',
        new Set((await db.serviceRequest.findMany({ select: { ref: true } })).map((r) => r.ref)),
      ],
    ]);

    const orphans = bells
      .filter((row) => {
        const known = live.get(row.entityType ?? '');
        /** نوعٌ لا نعرفه لا يُحذف — الجهل ليس إذنًا بالحذف */
        if (known === undefined) return false;
        return row.entityId === null || !known.has(row.entityId);
      })
      .map((row) => row.id);

    if (orphans.length > 0) {
      await db.notification.deleteMany({ where: { id: { in: orphans } } });
      console.log(`  نُظّف ${String(orphans.length)} إشعارًا يتيمًا ${when}`);
    }
  }

  const requests = await db.serviceRequest.findMany({ select: { id: true, ref: true } });
  const staleRequests = requests.filter((row) => TEST_SERVICE_REF.test(row.ref)).map((r) => r.id);
  if (staleRequests.length > 0) {
    await db.inspectionReport.deleteMany({ where: { serviceRequestId: { in: staleRequests } } });
    await db.serviceRequest.deleteMany({ where: { id: { in: staleRequests } } });
    console.log(`  نُظّف ${String(staleRequests.length)} طلب خدمة ${when}`);
  }

  /**
   * **والمستخدم يُحذف آخرًا** — ما يتعلّق به (`Notification`,
   * `Favorite`, `SavedSearch`…) موصولٌ بـ`onDelete: Cascade`، وما ليس
   * كذلك (`Listing`, `Order`) نُظّف بشكله أعلاه. وحذفُه قبلها يرتطم
   * بقيدٍ أجنبيّ فيسقط الإعداد كلُّه.
   */
  const people = await db.user.findMany({ select: { id: true, phone: true } });
  const staleUsers = people.filter((row) => TEST_USER_PHONE.test(row.phone)).map((row) => row.id);
  if (staleUsers.length > 0) {
    /**
     * **والشرط كلُّ علاقةٍ تمنع الحذف، لا ثلاثٌ منها.**
     *
     * حرستُ الإعلانات والطلبات وحدها فارتطم التنظيف بـ
     * `Vehicle_ownerId_fkey` — مركبةٌ يتيمة بقيت من تشغيلٍ سقط قبل
     * `afterAll`. **وسقوطُه يُسقط الإعداد كلَّه**، فلا يعمل اختبارٌ
     * واحد حتى يُحذف الصفّ بيد.
     *
     * والقائمة مُستخرَجةٌ من المخطّط لا من الذاكرة: كلُّ علاقةٍ إلى
     * `User` بـ`onDelete: Restrict`. ولإعادة استخراجها:
     *   grep -nE "@relation\([^)]*references: \[id\]" prisma/schema.prisma \
     *     | grep -v "onDelete: Cascade"
     */
    const detached = await db.user.deleteMany({
      where: {
        id: { in: staleUsers },
        vehicles: { none: {} },
        listings: { none: {} },
        offers: { none: {} },
        bids: { none: {} },
        deposits: { none: {} },
        ordersAsBuyer: { none: {} },
        ordersAsSeller: { none: {} },
        serviceRequests: { none: {} },
        invoices: { none: {} },
        reports: { none: {} },
        payouts: { none: {} },
        wallet: { is: null },
      },
    });
    if (detached.count > 0) {
      console.log(`  نُظّف ${String(detached.count)} مستخدم اختبار ${when}`);
    }
  }

  /**
   * ═══ وقيدُ المصادرة يتسرّب — ويُضخّم الإيراد ═══
   *
   * معاملةُ `deposit.forfeited` **بلا `orderId`**، فتُفلت من كل تنظيفٍ
   * يجمع به. وقِيس: خمسةُ آلافٍ في كل تشغيل، و«إيراد المنصّة» في دفتر
   * التطوير صار ستّة أضعافه — ولا اختبارَ يسأل «كم في الدفتر».
   *
   * **واليتيم بدفعته**: قيدٌ لا دفعةَ له قائمة هو قيدٌ حُذف أصلُه.
   * ومصادرةٌ حقيقية دفعتُها باقية، فلا تُمَسّ.
   */
  const forfeits = await db.ledgerEntry.findMany({
    where: { event: 'deposit.forfeited' },
    select: { txnId: true, paymentId: true },
  });
  if (forfeits.length > 0) {
    const paymentIds = [...new Set(forfeits.map((row) => row.paymentId).filter((id) => id !== null))];
    const alive = new Set(
      (await db.payment.findMany({ where: { id: { in: paymentIds } }, select: { id: true } })).map(
        (row) => row.id,
      ),
    );
    const orphanTxns = [
      ...new Set(
        forfeits
          .filter((row) => row.paymentId === null || !alive.has(row.paymentId))
          .map((row) => row.txnId),
      ),
    ];
    if (orphanTxns.length > 0) {
      const removed = await db.ledgerEntry.deleteMany({ where: { txnId: { in: orphanTxns } } });
      console.log(`  نُظّف ${String(removed.count)} قيد مصادرةٍ يتيم ${when}`);
    }
  }

  /**
   * ═══ ودفترُ البوّابة التجريبية يتسرّب — ويُفسد المطابقة ═══
   *
   * كلُّ حجزٍ ودفعٍ في اختبارٍ يكتب صفًّا في `SandboxTransaction`، ولا
   * شيء يحذفه: **ألفان وخمسُمئة صفّ في يومين**، منها مئةٌ وخمسٌ
   * وتسعون تسوية.
   *
   * وليست ركامًا فقط: `settlementFor(date)` — الأصلُ الذي تُقارَن به
   * مرآتُنا في `reconcileYesterday` — **تقرأ صفوف `SETTLE` و`RETURN`
   * ليومها**. فتسويةٌ تركها اختبارٌ تصير في تقرير البوّابة مبلغًا بلا
   * قيدٍ يقابله: فرقٌ يوميّ مصنوعٌ في معمَلنا، ومن يقرؤه يبحث عن
   * عطلٍ في المال.
   *
   * **واليتيم بشكله**: صفٌّ لا دفعةَ تشير إليه — بحجزها أو بتسويتها —
   * ولا أبٌ له قائم. فما تركه اختبارٌ حُذفت دفعتُه يُمسح، وما يحمله
   * مشيٌ يدويّ قائم يبقى.
   */
  const sandbox = await db.sandboxTransaction.findMany({
    select: { id: true, ref: true, parentRef: true },
  });
  if (sandbox.length > 0) {
    const refs = sandbox.map((row) => row.ref);
    const owners = await db.payment.findMany({
      where: { OR: [{ holdRef: { in: refs } }, { settleRef: { in: refs } }] },
      select: { holdRef: true, settleRef: true },
    });
    const known = new Set<string>();
    for (const row of owners) {
      if (row.holdRef !== null) known.add(row.holdRef);
      if (row.settleRef !== null) known.add(row.settleRef);
    }

    const orphanSandbox = sandbox
      .filter((row) => !known.has(row.ref))
      .filter((row) => row.parentRef === null || !known.has(row.parentRef))
      .map((row) => row.id);

    if (orphanSandbox.length > 0) {
      await db.sandboxTransaction.deleteMany({ where: { id: { in: orphanSandbox } } });
      console.log(`  نُظّف ${String(orphanSandbox.length)} معاملة بوّابة تجريبية يتيمة ${when}`);
    }
  }

  if (ids.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.adminSession.deleteMany({ where: { adminUserId: { in: ids } } });
    await db.adminUser.deleteMany({ where: { id: { in: ids } } });
    console.log(`  نُظّف ${String(ids.length)} حساب اختبار ${when}`);
  }

  /**
   * **والتسرّب الصامت يُقاس لا يُلاحَظ.** مئةٌ وعشرة إعلاناتِ اختبار
   * تراكمت مرّةً في قاعدة التطوير فضخّمت كل عدّاد سوق، ولم يكشفها
   * أحدٌ لأنّ لا اختبار يسأل «كم صفًّا في القاعدة».
   *
   * ومواعيدُ المعاينة تُبنى بالمولِّد الحقيقيّ فلا شكلَ يميّزها —
   * **فتُعدّ ولا تُحذف**: المشيُ بالنقر يُنشئ صفوفًا حقيقية أُريد
   * بقاءها، و`npm run trial:reset` يُزيلها حين يُراد.
   */
  const viewings = await db.viewing.count();
  if (viewings > SEEDED_VIEWINGS) {
    console.log(
      `  مواعيدُ معاينةٍ فوق المزروع: ${String(viewings - SEEDED_VIEWINGS)} ${when}` +
        ' — إن لم تكن من مشيٍ يدويّ فهي تسرّب (npm run trial:reset)',
    );
  }

  await db.$disconnect();
}

import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createListing, type PublishInput } from '@/lib/domain/publish';
import { sellingAllowance } from '@/lib/domain/entitlements';

afterAll(async () => {
  await db.uploadedAsset.deleteMany({ where: { r2Key: { startsWith: 'probe/' } } });
  // الاستعادة إلى ما كان لا إلى فراغ — الصفّ مزروع لا مصنوع هنا
  for (const [id, before] of touchedUsers) {
    await db.user.update({ where: { id }, data: before });
  }
  await db.$disconnect();
});

const created: string[] = [];
const touchedUsers = new Map<
  string,
  { taxStatus: 'INDIVIDUAL' | 'VAT_REGISTERED' | null; email: string | null; idVerified: boolean; iban: string | null }
>();

async function base(): Promise<PublishInput> {
  const model = await db.model.findFirstOrThrow({
    where: { trims: { some: { visible: true } } },
    include: { brand: true, trims: { where: { visible: true }, take: 1 } },
  });
  const seller = await db.user.findFirstOrThrow({ where: { dealerId: null } });
  /**
   * البائع يُهيَّأ كما يصل إلى النشر فعلًا: ملفٌ مكتمل ووضعٌ ضريبيّ
   * محدَّد. والشاشة تشترطهما، والحارس صار يشترطهما — فالمهيّأ ناقصًا
   * يختبر حالةً لا يبلغها مستخدم.
   */
  await db.user.update({
    where: { id: seller.id },
    data: {
      taxStatus: 'INDIVIDUAL',
      email: seller.email ?? `probe${seller.id.slice(-6)}@carsell.one`,
      idVerified: true,
      iban: seller.iban ?? 'SA0380000000608010167519',
    },
  });
  touchedUsers.set(seller.id, {
    taxStatus: seller.taxStatus,
    email: seller.email,
    idVerified: seller.idVerified,
    iban: seller.iban,
  });
  return {
    sellerId: seller.id,
    type: 'DIRECT',
    askPrice: 90_000,
    taxableSupply: null,
    vehicle: {
      brandId: model.brandId,
      modelId: model.id,
      // الفئة تُملي الهيكل والدفع والمقاعد — ولا تُكتب يدويًّا
      trimId: model.trims[0]!.id,
      year: 2023,
      mileageKm: 40_000,
      transmission: 'AUTOMATIC',
      fuel: 'PETROL',
      spec: 'SAUDI',
      condition: 'USED',
      city: 'الرياض',
      colorExterior: 'أبيض',
      vin: null,
    },
    images: [await asset(seller.id, 'probe/a.jpg', 'ffffffffffffffff')],
  };
}

/**
 * الصور تُرفع قبل النشر — والبصمة تُخزَّن في الخادم لا تُرسَل معه.
 * فالاختبار يزرع الصفّ كما يزرعه مسار الرفع.
 */
const seeded: string[] = [];
async function asset(ownerId: string, key: string, phash: string): Promise<string> {
  await db.uploadedAsset.upsert({
    where: { r2Key: key },
    create: { r2Key: key, ownerId, phash, plateBlurred: true, qualityFlags: [] },
    update: { ownerId, phash },
  });
  seeded.push(key);
  return key;
}

async function cleanup() {
  if (created.length === 0) return;
  const rows = await db.listing.findMany({
    where: { ref: { in: created } },
    select: { id: true, vehicleId: true },
  });
  const ids = rows.map((r) => r.id);
  /**
   * **وأثرٌ جديد يُضاف إلى الاستعادة.** صار النشر يُنشئ `Auction`،
   * وصفٌّ يبقى يُسقط جيرانه في التشغيل التالي — والقاعدة مسجَّلة:
   * كل ملفّ ينظّف ما كان يعرفه **يوم كُتب**.
   */
  await db.auction.deleteMany({ where: { listingId: { in: ids } } });
  await db.listingImage.deleteMany({ where: { listingId: { in: ids } } });
  await db.listing.deleteMany({ where: { id: { in: ids } } });
  await db.vehicle.deleteMany({ where: { id: { in: rows.map((r) => r.vehicleId) } } });
  created.length = 0;
  await db.uploadedAsset.deleteMany({ where: { r2Key: { in: seeded } } });
  seeded.length = 0;
}

describe('النشر — والحارس معه لا بعده', () => {
  it('بلا شرطٍ منطبق يُنشر مباشرةً — لا مراجعة بشرية افتراضية', async () => {
    const input = await base();
    try {
      const result = await createListing(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      created.push(result.ref);

      expect(result.status).toBe('PUBLISHED');
      expect(result.reviewReason).toBeNull();
      const row = await db.listing.findUniqueOrThrow({ where: { ref: result.ref } });
      expect(row.publishedAt).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  /**
   * **السعر الشاذّ يُراجَع ولا يُرفض**: بيعٌ مستعجل صادق يبدو شاذًّا،
   * والرفض يعاقب بائعًا مضطرًّا.
   */
  it('سعرٌ دون ٤٠٪ من p25 يدخل المراجعة ولا يُنشر', async () => {
    const input = await base();
    const stat = await db.priceStat.findFirst({
      where: { modelId: input.vehicle.modelId },
      orderBy: { computedAt: 'desc' },
    });
    if (stat === null) return;

    input.vehicle.year = stat.year;
    input.askPrice = Math.max(1, Math.floor(Number(stat.p25) * 0.3));

    try {
      const result = await createListing(input);
      if (!result.ok) return;
      created.push(result.ref);

      expect(result.status).toBe('PENDING_REVIEW');
      expect(result.reviewReason).toBe('PRICE_OUTLIER');
      // ولم يُنشَر — فتاريخ النشر لا يُكتب لما لم يُنشَر
      const row = await db.listing.findUniqueOrThrow({ where: { ref: result.ref } });
      expect(row.publishedAt).toBeNull();
    } finally {
      await cleanup();
    }
  });

  /**
   * **التكرار يُقاس مع إعلان مستخدمٍ آخر.** وبائعٌ يعيد صورة سيارته
   * ليس ناسخًا، وإدخالُه المراجعة يعاقب سلوكًا مشروعًا.
   */
  it('صورة البائع نفسه لا تُدخل المراجعة', async () => {
    const input = await base();
    const own = await db.listingImage.findFirst({
      where: { phash: { not: null }, listing: { sellerId: input.sellerId } },
      select: { phash: true },
    });
    if (own?.phash == null) return;

    input.images = [await asset(input.sellerId, 'probe/dup.jpg', own.phash)];

    try {
      const result = await createListing(input);
      if (!result.ok) return;
      created.push(result.ref);
      expect(result.reviewReason).not.toBe('DUPLICATE_IMAGE');
    } finally {
      await cleanup();
    }
  });

  it('صورة بائعٍ آخر تُدخل المراجعة', async () => {
    const input = await base();
    const other = await db.listingImage.findFirst({
      where: { phash: { not: null }, listing: { sellerId: { not: input.sellerId } } },
      select: { phash: true },
    });
    if (other?.phash == null) return;

    input.images = [await asset(input.sellerId, 'probe/dup2.jpg', other.phash)];

    try {
      const result = await createListing(input);
      if (!result.ok) return;
      created.push(result.ref);
      expect(result.status).toBe('PENDING_REVIEW');
      expect(result.reviewReason).toBe('DUPLICATE_IMAGE');
    } finally {
      await cleanup();
    }
  });

  /** **هيكلٌ معروض بالفعل يُوقِف** — رفضٌ لا مراجعة: الرقم لا يحتمل تأويلًا. */
  it('هيكل معروض بالفعل يُرفض', async () => {
    const listed = await db.vehicle.findFirst({
      where: { vin: { not: null }, listings: { some: { status: 'PUBLISHED' } } },
      select: { vin: true },
    });
    if (listed?.vin == null) return;

    const input = await base();
    input.vehicle.vin = listed.vin;
    expect(await createListing(input)).toEqual({ ok: false, reason: 'VIN_ALREADY_LISTED' });
  });

  /**
   * **حارسٌ في العميل ليس حارسًا.** المعالج يفتح النافذة قبل النداء،
   * ونداءٌ مباشر كان ينشر لبائعٍ لم يُسأل فيُعرض سعره بوصفٍ اخترناه له.
   */
  it('لا نشر قبل تحديد الوضع الضريبي', async () => {
    const input = await base();
    await db.user.update({ where: { id: input.sellerId }, data: { taxStatus: null } });
    expect(await createListing(input)).toEqual({ ok: false, reason: 'TAX_STATUS_REQUIRED' });
    await db.user.update({ where: { id: input.sellerId }, data: { taxStatus: 'INDIVIDUAL' } });
  });

  it('بلا صور يُرفض — والإعلان بلا صورة لا يُشاهَد أصلًا', async () => {
    const input = await base();
    input.images = [];
    expect(await createListing(input)).toEqual({ ok: false, reason: 'NO_IMAGES' });
  });

  /**
   * **البصمة من الخادم لا من العميل.** ومفتاحٌ لم يُرفع — أو رفعه غيرك
   * — لا يصير صورتك بذكره، وإلّا صار كشف التكرار حارسًا يُطفأ بالتجاوز.
   */
  it('مفتاح لم يُرفع يُرفض', async () => {
    const input = await base();
    input.images = ['probe/never-uploaded.jpg'];
    expect(await createListing(input)).toEqual({ ok: false, reason: 'IMAGE_NOT_UPLOADED' });
  });

  it('ومفتاحٌ رفعه غيرك يُرفض', async () => {
    const input = await base();
    const other = await db.user.findFirstOrThrow({ where: { id: { not: input.sellerId } } });
    input.images = [await asset(other.id, 'probe/foreign.jpg', 'aaaaaaaaaaaaaaaa')];
    expect(await createListing(input)).toEqual({ ok: false, reason: 'IMAGE_NOT_UPLOADED' });
  });

  /**
   * **الهيكل والدفع والمقاعد من الفئة لا من الإدخال.** وأربعة حقول
   * يكتبها البائع يخطئ في أحدها، والمخطّط يقول إنها «تُنسخ لقطةً».
   */
  it('القيَم الموروثة تُنسخ من الفئة', async () => {
    const input = await base();
    const trim = await db.trim.findUniqueOrThrow({ where: { id: input.vehicle.trimId } });
    try {
      const result = await createListing(input);
      if (!result.ok) return;
      created.push(result.ref);

      const listing = await db.listing.findUniqueOrThrow({
        where: { ref: result.ref },
        include: { vehicle: true },
      });
      expect(listing.vehicle.bodyType).toBe(trim.bodyType);
      expect(listing.vehicle.drivetrain).toBe(trim.drivetrain);
      expect(listing.vehicle.seats).toBe(trim.seats);
      // واسم الفئة لقطةٌ لا مرجع — تعديلها لاحقًا لا يمسّ الإعلان
      expect(listing.vehicle.trimName).toBe(trim.nameAr);
    } finally {
      await cleanup();
    }
  });

  it('فئةٌ من طرازٍ آخر تُرفض', async () => {
    const input = await base();
    const foreign = await db.trim.findFirst({
      where: { modelId: { not: input.vehicle.modelId }, visible: true },
      select: { id: true },
    });
    if (foreign === null) return;
    input.vehicle.trimId = foreign.id;
    expect(await createListing(input)).toEqual({ ok: false, reason: 'TRIM_UNKNOWN' });
  });
});

/**
 * ═══ المزاد يُنشأ مع إعلانه ═══
 *
 * العطل الذي وُلدت منه هذه الكتلة: **لا شيء في المنتج كلّه يُنشئ صفّ
 * `Auction` إلّا البذرة**. فمن اختار «مزاد» في المعالج أنشأ إعلانًا
 * نوعُه `AUCTION` بلا مزاد — وصفحةُ المزاد ٤٠٤، وصفحةُ المركبة تحمل
 * وسم «مزاد» وتعرض «اشترِ الآن عبر الضمان».
 *
 * وقِيس بالمشي: أُنشئ الصفّ يدويًّا وفُتحت صفحتاه.
 */
describe('المزاد يُنشأ مع إعلانه — لا بعده ولا أبدًا', () => {
  it('«مزاد» بلا إعدادات يُرفض — ولا يُنشأ إعلانٌ أعرج', async () => {
    const input = { ...(await base()), type: 'AUCTION' as const };
    expect(await createListing(input)).toEqual({
      ok: false,
      reason: 'AUCTION_SETTINGS_REQUIRED',
    });
  });

  it('ينشئ صفّ المزاد في المعاملة نفسها', async () => {
    const input: PublishInput = {
      ...(await base()),
      type: 'AUCTION',
      auction: {
        durationDays: 3,
        startsAt: null,
        reservePrice: 95_000,
        bidIncrement: null,
        buyNowPrice: null,
        depositAmount: null,
        viewingCity: 'الرياض',
        viewingAddress: null,
      },
    };

    const result = await createListing(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    created.push(result.ref);

    const listing = await db.listing.findUniqueOrThrow({
      where: { ref: result.ref },
      select: { id: true, type: true },
    });
    expect(listing.type).toBe('AUCTION');

    const auction = await db.auction.findUnique({ where: { listingId: listing.id } });
    expect(auction, 'لا صفّ مزاد — وهو العطل نفسه').not.toBeNull();
    expect(Number(auction!.startPrice)).toBe(input.askPrice);
    expect(Number(auction!.reservePrice)).toBe(95_000);

    /** الفرق الافتراضيّ من إعدادات المشغّل لا من رقمٍ في الشيفرة. */
    const { auctionSettings } = await import('@/lib/domain/admin-auction-settings');
    const settings = await auctionSettings();
    expect(Number(auction!.bidIncrement)).toBe(Number(settings.minIncrement));
    expect(Number(auction!.depositAmount)).toBe(Number(settings.defaultDeposit));

    /**
     * **ومَن يبدأ فورًا يُكتب `LIVE`.** و`SCHEDULED` بموعدٍ ماضٍ
     * تنتظر وظيفةً دورية قد لا تمرّ قبل أن ينقضي وقتُه كلُّه — فيُغلق
     * بلا مزايدةٍ واحدة.
     */
    expect(auction!.status).toBe('LIVE');
    expect(auction!.endsAt.getTime() - auction!.startsAt.getTime()).toBe(3 * 24 * 3600 * 1000);

    await cleanup();
  });

  it('الموعد المستقبليّ يبقى مجدولًا', async () => {
    const soon = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const input: PublishInput = {
      ...(await base()),
      type: 'AUCTION',
      auction: {
        durationDays: 1, startsAt: soon, reservePrice: null,
        bidIncrement: null, buyNowPrice: null,
        depositAmount: null, viewingCity: null, viewingAddress: null,
      },
    };

    const result = await createListing(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    created.push(result.ref);

    const listing = await db.listing.findUniqueOrThrow({ where: { ref: result.ref } });
    const auction = await db.auction.findUniqueOrThrow({ where: { listingId: listing.id } });
    expect(auction.status).toBe('SCHEDULED');

    await cleanup();
  });

  /** احتياطيٌّ دون سعر الافتتاح يُبلَغ بأوّل مزايدة — فلا معنى له. */
  it('يرفض احتياطيًّا دون سعر الافتتاح، ومدّةً غير متاحة، وموعدًا مضى', async () => {
    const input = await base();
    const auction = {
      durationDays: 3, startsAt: null, reservePrice: null,
      bidIncrement: null, buyNowPrice: null,
      depositAmount: null, viewingCity: null, viewingAddress: null,
    };

    expect(
      await createListing({
        ...input, type: 'AUCTION',
        auction: { ...auction, reservePrice: input.askPrice - 1 },
      }),
    ).toEqual({ ok: false, reason: 'AUCTION_RESERVE_INVALID' });

    expect(
      await createListing({ ...input, type: 'AUCTION', auction: { ...auction, durationDays: 11 } }),
    ).toEqual({ ok: false, reason: 'AUCTION_DURATION_INVALID' });

    expect(
      await createListing({
        ...input, type: 'AUCTION',
        auction: { ...auction, startsAt: new Date(Date.now() - 3_600_000).toISOString() },
      }),
    ).toEqual({ ok: false, reason: 'AUCTION_STARTS_IN_PAST' });
  });

  /** دون الاحتياطي يشتري المشتري بأقلّ ممّا قَبِل به البائع — بضغطة. */
  it('يرفض «اشترِ الآن» دون الاحتياطي', async () => {
    const input = await base();
    expect(
      await createListing({
        ...input, type: 'AUCTION',
        auction: {
          durationDays: 3, startsAt: null, reservePrice: 95_000,
          bidIncrement: null, buyNowPrice: 94_000,
          depositAmount: null, viewingCity: null, viewingAddress: null,
        },
      }),
    ).toEqual({ ok: false, reason: 'AUCTION_BUY_NOW_INVALID' });
  });
});

/**
 * ═══ وحدُّ القبول لم يكن له كاتبٌ عند النشر ═══
 *
 * النطاق يرفض العروض دونه تلقائيًّا، ومركز المساعدة يقول للمشتري
 * «البائع يحدّد حدًّا أدنى مخفيًا» — ولا حقل في المعالج يسأله عنه.
 */
describe('حدّ القبول عند النشر', () => {
  it('يُكتب مع الإعلان ولا يخرج في استجابة', async () => {
    const input: PublishInput = {
      ...(await base()),
      type: 'NEGOTIATION',
      negotiation: { minAcceptPrice: 80_000 },
    };

    const result = await createListing(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    created.push(result.ref);

    const row = await db.listing.findUniqueOrThrow({ where: { ref: result.ref } });
    expect(Number(row.minAcceptPrice)).toBe(80_000);
    expect(row.negotiable).toBe(true);

    // **ولا يخرج في الاستجابة** — والنتيجة مرجعٌ وحالةٌ وسببُ مراجعة
    expect(JSON.stringify(result)).not.toContain('80000');

    await cleanup();
  });

  it('يرفض حدًّا يعلو السعر المعلن — وإلّا رُفض كل عرض تلقائيًّا', async () => {
    const input = await base();
    expect(
      await createListing({
        ...input, type: 'NEGOTIATION',
        negotiation: { minAcceptPrice: input.askPrice + 1 },
      }),
    ).toEqual({ ok: false, reason: 'MIN_ACCEPT_INVALID' });
  });
});


/**
 * ═══ خصائصُ الباقة تُقرأ — وكانت لا تُقرأ ═══
 *
 * عشرُ خصائص وشاشةُ أدمن تضبطها، **ولا سطرَ في المنتج يسأل عن
 * واحدة**. فمشغّلٌ يمنع المزاد عن مستخدمٍ بتجاوزٍ يراه محفوظًا —
 * والمستخدم ينشر مزادًا بعده بدقيقة.
 *
 * والتجاوزُ يُزرع ويُحذف هنا: صفٌّ يبقى يمنع بائعًا مزروعًا في كل
 * تشغيلٍ تالٍ، ويسقط جيرانه لا هذا الملفّ.
 */
describe('خصائصُ الباقة تحكم النشر', () => {
  const overrides: string[] = [];

  afterEach(async () => {
    if (overrides.length > 0) {
      await db.entitlementOverride.deleteMany({ where: { id: { in: overrides } } });
      overrides.length = 0;
    }
  });

  async function deny(userId: string, key: string, value: string): Promise<void> {
    const row = await db.entitlementOverride.create({
      data: { userId, entitlementKey: key, value, reason: 'اختبار', createdBy: 'test' },
    });
    overrides.push(row.id);
  }

  it('تجاوزٌ يمنع المزاد يردّ النشر — والافتراضيّ يسمح', async () => {
    const input = await base();

    /** **والافتراضيّ أوّلًا** — وإلّا لم نعرف أالمنعُ من التجاوز أم من سواه. */
    const allowed = await sellingAllowance(input.sellerId);
    expect(allowed.types.AUCTION).toBe(true);

    await deny(input.sellerId, 'can_auction', 'false');

    const after = await sellingAllowance(input.sellerId);
    expect(after.types.AUCTION).toBe(false);
    expect(after.types.DIRECT).toBe(true);

    const result = await createListing({
      ...input,
      type: 'AUCTION',
      auction: {
        durationDays: 7, startsAt: null, reservePrice: null, bidIncrement: null,
        buyNowPrice: null, depositAmount: null,
        viewingCity: 'الرياض', viewingAddress: 'حي الملقا',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('SALE_METHOD_NOT_ALLOWED');
  });

  it('وحدُّ الإعلانات يُفرض — ويُحسب من المعروض لا من المسودّات', async () => {
    const input = await base();

    /** حدٌّ صفرٌ: أوّلُ نشرٍ يبلغه، فلا يعتمد الاختبار على ما زُرع. */
    await deny(input.sellerId, 'max_active_listings', '0');

    expect((await sellingAllowance(input.sellerId)).maxActiveListings).toBe(0);

    const result = await createListing(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('LISTING_LIMIT_REACHED');

    /** **والمسودّة تخرج قبل الحدّ** — حفظُ ما كتبه المرء ليس عرضًا. */
    const draft = await createListing({ ...input, draft: true });
    expect(draft.ok).toBe(true);
    if (draft.ok) {
      created.push(draft.ref);
      expect(draft.status).toBe('DRAFT');
    }
  });

  it('وبلا تجاوزٍ يمرّ النشر — فالوصل لا يغيّر سلوك اليوم', async () => {
    const input = await base();
    const result = await createListing(input);
    expect(result.ok).toBe(true);
    if (result.ok) created.push(result.ref);
  });
});

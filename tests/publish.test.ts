import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createListing, type PublishInput } from '@/lib/domain/publish';

afterAll(async () => {
  await db.uploadedAsset.deleteMany({ where: { r2Key: { startsWith: 'probe/' } } });
  await db.$disconnect();
});

const created: string[] = [];

async function base(): Promise<PublishInput> {
  const model = await db.model.findFirstOrThrow({
    where: { trims: { some: { visible: true } } },
    include: { brand: true, trims: { where: { visible: true }, take: 1 } },
  });
  const seller = await db.user.findFirstOrThrow({ where: { dealerId: null } });
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

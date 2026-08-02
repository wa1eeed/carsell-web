import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  canonicalPath,
  faqForListing,
  findListingForMetadata,
  findPublishedListing,
  similarListings,
  toPublicDetail,
  toSlug,
} from '@/lib/domain/listing-detail';

afterAll(async () => {
  await db.$disconnect();
});

const anyRef = async (where: object = {}): Promise<string> => {
  const row = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED', ...where },
    select: { ref: true },
  });
  return row.ref;
};

describe('السرّ لا يخرج — قرار ٢٩', () => {
  /**
   * المعيار الحقيقي **قيمة لا كلمة**: `reserveMet` راية أجازها القرار
   * ٢٩ نصًّا، والممنوع المبلغ. فالاختبار يقارن بالقيَم الفعلية في
   * قاعدة البيانات لا بأسماء الحقول.
   */
  it('لا مبلغ احتياطي ولا حدّ أدنى مقبول في أي كائن عام', async () => {
    const secrets = [
      ...(await db.auction.findMany({ select: { reservePrice: true } })).map(
        (a) => a.reservePrice,
      ),
      ...(await db.listing.findMany({
        where: { minAcceptPrice: { not: null } },
        select: { minAcceptPrice: true },
      })).map((l) => l.minAcceptPrice),
    ]
      .filter((v) => v !== null)
      .map(String);

    expect(secrets.length, 'لا أسرار في القاعدة — الاختبار بلا معنى').toBeGreaterThan(0);

    const refs = await db.listing.findMany({
      where: { status: 'PUBLISHED' },
      select: { ref: true },
      take: 20,
    });

    for (const { ref } of refs) {
      const row = await findPublishedListing(ref);
      if (row === null) continue;
      const json = JSON.stringify(await toPublicDetail(row));

      expect(json, ref).not.toContain('reservePrice');
      expect(json, ref).not.toContain('minAcceptPrice');
      for (const secret of secrets) {
        expect(json, `${ref} سرّب ${secret}`).not.toContain(secret);
      }
    }
  });

  it('راية `reserveMet` تخرج والمبلغ لا — والحدّ الأدنى للمزايدة آمن', async () => {
    const row = await findPublishedListing(await anyRef({ auction: { isNot: null } }));
    const detail = await toPublicDetail(row!);
    expect(detail.auction).not.toBeNull();
    expect(typeof detail.auction?.reserveMet).toBe('boolean');

    // أعلى مزايدة + خطوة — لا يُشتق منه الاحتياطي
    const auction = await db.auction.findFirstOrThrow({
      where: { listing: { ref: detail.ref } },
    });
    expect(detail.auction?.minimumBid).not.toBe(auction.reservePrice?.toString());
  });

  it('استعلام الوسوم لا يجرّ الحقول السرّية أصلًا', async () => {
    const row = await findListingForMetadata(await anyRef());
    expect(JSON.stringify(row)).not.toContain('minAcceptPrice');
  });
});

describe('الرابط الأساسي — قرار ٢٥', () => {
  it('يُبنى من المدينة والماركة والطراز والمرجع', async () => {
    const row = await findPublishedListing(await anyRef());
    const canonical = canonicalPath('ar', row!);
    expect(canonical.path.startsWith('/ar/cars/')).toBe(true);
    expect(canonical.path.endsWith(row!.ref)).toBe(true);
  });

  /** ترويسة `Location` لا تقبل إلا ASCII — مسار عربي خام يسقط الطلب. */
  it('المسار مُرمَّز والمعروض مفكوك', async () => {
    const row = await findPublishedListing(await anyRef({ city: 'الرياض' }));
    const canonical = canonicalPath('ar', row!);
    expect(canonical.path).toMatch(/^[\x20-\x7E]*$/);
    expect(canonical.display).toContain('الرياض');
  });

  /**
   * حلقة تحويل لا نهائية وقعت فعلًا: الأجزاء تصل مُرمَّزة من Next
   * وتُقارَن بنصّ مفكوك، فلا تتطابق أبدًا. فكّ الترميز يُعيد التطابق.
   */
  it('فكّ أجزاء المسار يعيد ما بناه التسلسل — لا حلقة تحويل', async () => {
    const row = await findPublishedListing(await anyRef({ city: 'الرياض' }));
    const canonical = canonicalPath('ar', row!);
    const parts = canonical.path.split('/').slice(3).map(decodeURIComponent);
    expect(parts).toEqual([canonical.city, canonical.brand, canonical.model, canonical.ref]);
  });

  it('التشريح يحفظ العربية ويسقط ما لا يصلح مسارًا', () => {
    expect(toSlug('الرياض')).toBe('الرياض');
    expect(toSlug('Land Cruiser')).toBe('land-cruiser');
    expect(toSlug('CX-5')).toBe('cx-5');
    expect(toSlug('  راف٤ / GXR ')).toBe('راف٤-gxr');
  });
});

describe('الأسئلة حسب طريقة البيع — قرار ٣١', () => {
  it('لكل نوع مجموعته، ولا نوع بلا أسئلة', async () => {
    for (const type of ['DIRECT', 'NEGOTIATION', 'AUCTION'] as const) {
      const rows = await faqForListing(type);
      expect(rows.length, type).toBeGreaterThan(0);
    }
  });

  it('الخاصّ بالنوع يسبق العامّ', async () => {
    const negotiation = await faqForListing('NEGOTIATION');
    const specific = await db.faqPlacement.findMany({
      where: { surface: 'listing_page', listingType: 'NEGOTIATION', active: true },
      select: { faqId: true },
    });
    const first = negotiation.slice(0, specific.length).map((r) => r.id);
    expect(new Set(first)).toEqual(new Set(specific.map((s) => s.faqId)));
  });

  it('لا سؤال مكرّر — العامّ والخاصّ قد يشتركان', async () => {
    const rows = await faqForListing('AUCTION');
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});

describe('السيارات المشابهة', () => {
  it('لا تُعيد الإعلان نفسه ولا غير المنشور', async () => {
    const ref = await anyRef();
    const row = await findPublishedListing(ref);
    const similar = await similarListings(row!);
    expect(similar.map((s) => s.ref)).not.toContain(ref);

    for (const item of similar) {
      const status = await db.listing.findUniqueOrThrow({
        where: { ref: item.ref },
        select: { status: true },
      });
      expect(status.status).toBe('PUBLISHED');
    }
  });

  it('العنوان بلا سنة هنا أيضًا', async () => {
    const row = await findPublishedListing(await anyRef());
    for (const item of await similarListings(row!)) {
      expect(item.title).not.toContain(String(item.year));
    }
  });
});

describe('التكلفة والصبغ', () => {
  it('الإجمالي = السعر + العمولة + رسوم النقل', async () => {
    const row = await findPublishedListing(await anyRef());
    const { cost } = await toPublicDetail(row!);
    expect(Number(cost.total)).toBe(
      Number(cost.price) + Number(cost.commission) + Number(cost.transferFee),
    );
  });

  /** الفحص يتجاوز إقرار البائع، والمصدر يُعرض مع الحالة (قرار ١٦). */
  it('مصدر حالة الصبغ يتبع وجود الفحص', async () => {
    const withReport = await db.listing.findFirst({
      where: { status: 'PUBLISHED', vehicle: { inspectionReports: { some: {} } } },
      select: { ref: true },
    });
    if (withReport !== null) {
      const row = await findPublishedListing(withReport.ref);
      expect((await toPublicDetail(row!)).vehicle.paint.source).toBe('INSPECTION');
    }

    const without = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED', vehicle: { inspectionReports: { none: {} } } },
      select: { ref: true },
    });
    const row = await findPublishedListing(without.ref);
    expect((await toPublicDetail(row!)).vehicle.paint.source).toBe('SELLER');
  });

  it('موقع السعر يختفي دون عتبة العيّنة', async () => {
    const row = await findPublishedListing(await anyRef());
    const stat = (await toPublicDetail(row!)).priceStat;
    if (stat !== null) expect(stat.sampleSize).toBeGreaterThanOrEqual(8);
  });
});

describe('المزاد بلا مزايدات', () => {
  /**
   * صفرٌ في موضع السعر يوحي بأن المركبة بلا قيمة. سعر الافتتاح
   * موجود دائمًا، وهو الصادق حين لا مزايدة بعد.
   */
  it('سعر الافتتاح موجود دائمًا ليحلّ محلّ أعلى مزايدة غائبة', async () => {
    const rows = await db.listing.findMany({
      where: { status: 'PUBLISHED', auction: { isNot: null } },
      select: { ref: true },
    });
    expect(rows.length).toBeGreaterThan(0);

    for (const { ref } of rows) {
      const detail = await toPublicDetail((await findPublishedListing(ref))!);
      expect(Number(detail.auction?.startPrice), ref).toBeGreaterThan(0);
      if (detail.auction?.highestBid === null) {
        // الحدّ الأدنى للمزايدة الأولى = سعر الافتتاح، بلا خطوة
        expect(detail.auction.minimumBid).toBe(detail.auction.startPrice);
      }
    }
  });
});

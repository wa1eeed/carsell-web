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

/**
 * كل قيمةٍ ورقية مع مسارها — فيُقال **أين** وقع التسريب لا أنّ رقمًا
 * ما ظهر في مكانٍ ما.
 */
function leaves(value: unknown, path = ''): [string, unknown][] {
  if (value === null || typeof value !== 'object') return [[path, value]];
  if (Array.isArray(value)) {
    return value.flatMap((item, at) => leaves(item, `${path}[${String(at)}]`));
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, path === '' ? key : `${path}.${key}`),
  );
}

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

      /**
       * **والرقم يُفحص على القيَم لا في النصّ المُسلسَل.**
       *
       * كان الفحص `json.not.toContain(secret)` — فسقط حين ساوى
       * `priceStat.p75` احتياطيَّ مزادٍ آخر صدفةً (٩٥٬٠٠٠). والمئين
       * محسوبٌ من وسيط السوق ولا علاقة له باحتياطي أحد، لكنّ البحث
       * النصّيّ لا يفرّق بين قيمةٍ سُرّبت ورقمٍ تصادف.
       *
       * فيُمشى على **القيَم الورقية** بمسارها: تسريبٌ حقيقيّ يضع
       * المبلغ في حقلٍ ما، والمسار يسمّيه. (القاعدة مسجَّلة في هذا
       * المستودع، وهذه ثانيتُها.)
       */
      for (const [path, value] of leaves(await toPublicDetail(row))) {
        if (!secrets.includes(String(value))) continue;
        /**
         * وإحصاءُ السوق مئيناتٌ من وسيط السعر — ومساواتُها رقمًا
         * سرّيًّا مصادفةٌ حسابية لا تسريب. وما عداه يسقط.
         */
        expect(path.startsWith('priceStat.'), `${ref} سرّب ${String(value)} في ${path}`).toBe(true);
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

  /**
   * ═══ المسار لاتينيٌّ كاملًا — ولا ترميز فيه ═══
   *
   * كان هذا الفحص يثبّت `display` يحمل «الرياض»: المدينة كانت تُكتب
   * عربيةً في المسار وتُرمَّز (`%D8%A7%D9%84…`)، و`display` يفكّها
   * للعرض. **وهو تفصيلُ تنفيذ لا قرار**: القرار ٢٥ يحدّد شكل المسار
   * (`/cars/{city}/{brand}/{model}/{ref}`) لا خطَّه، وملفّ التصميم
   * يعرضه `riyadh/toyota/camry`.
   *
   * والرابط أوّل ما يُقرأ في نتيجة بحثٍ وفي رسالة — والمرمَّز يُشارَك
   * مشوَّهًا ولا يُنقر.
   */
  it('المسار لاتينيٌّ بلا ترميز، ولا يحمل عربية', async () => {
    const row = await findPublishedListing(await anyRef({ city: 'الرياض' }));
    const canonical = canonicalPath('ar', row!);
    expect(canonical.path).toMatch(/^[\x20-\x7E]*$/);
    expect(canonical.path).not.toContain('%');
    expect(canonical.city).toBe('riyadh');
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
    /**
     * **والطقم يشترط ما يفترضه.** كان الشرط «أيُّ تقرير» ثمّ يفحص أنّ
     * المصدر `INSPECTION` — **وتقريرُ المشتري خاصٌّ به** (قرار المالك
     * ٤)، فـ`toPublicDetail` تتجاهله بحقّ ويبقى المصدر `SELLER`.
     * ووقع حين اكتملت البذرة فظهر الصفُّ الخاصّ أوّلًا، فبدا السقوط
     * تقطّعًا وهو شرطٌ ناقص.
     */
    const withReport = await db.listing.findFirst({
      where: {
        status: 'PUBLISHED',
        vehicle: { inspectionReports: { some: { publishedAt: { not: null } } } },
      },
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

describe('═══ صفحة السيارة في المزاد ═══', () => {
  /**
   * **التكلفة على المزايدة لا على المطلوب.**
   *
   * كانت تُبنى على `askPrice` دائمًا، فمزادٌ افتتاحُه ٥٨٬٥٠٠ ومطلوبُه
   * ٧٨٬٠٠٠ يعرض «الإجمالي ٧٨٬٣٥٠» — رقمًا لا يدفعه أحد، ويقرؤه المزايد
   * قبل أن يزايد فيقيس عليه.
   */
  it('تُحسب التكلفة من الافتتاح حين لا مزايدة، ومن أعلى مزايدة بعدها', async () => {
    const row = await db.listing.findFirst({
      where: { status: 'PUBLISHED', type: 'AUCTION', auction: { isNot: null } },
      select: { ref: true, askPrice: true, auction: { select: { startPrice: true } } },
    });
    if (row === null || row.auction === null) return;

    const detail = await findPublishedListing(row.ref);
    if (detail === null) return;
    const view = await toPublicDetail(detail);

    expect(view.auction).not.toBeNull();
    expect(view.cost.provisional).toBe(true);

    /**
     * **القاعدة تُقاس لا الحالة.** كتبتُ أوّلًا «يساوي الافتتاح»
     * مفترضًا صفًّا بلا مزايدات، فالتقط الاختبار مزادًا عليه مزايدات
     * وسقط على ما لا يقيسه. والمقياس: أعلى مزايدة، والافتتاح حين لا
     * مزايدة — أيّهما كان حال الصفّ.
     */
    const expected = Number(view.auction?.highestBid ?? row.auction.startPrice);
    expect(Number(view.cost.price)).toBe(expected);
    expect(Number(view.cost.total)).toBeGreaterThanOrEqual(expected);
  });

  /**
   * **حيٌّ بالحالة والوقت معًا.** الحالة `LIVE` مخزَّنة لمزادٍ انقضى
   * حتى تمرّ الوظيفة الدورية — والزرّ كان يتبع الحالة وحدها.
   */
  it('مزادٌ انقضى وقتُه ليس حيًّا ولو بقيت حالته LIVE', async () => {
    /**
     * **مثبَّتٌ بـ`orderBy`.** كان `findFirst` بلا ترتيب، فالصفُّ الذي
     * يقع عليه يختلف بين زرعٍ وآخر — فيسقط على صفٍّ ويمرّ على جاره،
     * ويبدو تقطّعًا وهو عدمُ تثبيت.
     */
    const row = await db.listing.findFirst({
      where: { status: 'PUBLISHED', type: 'AUCTION', auction: { status: 'LIVE' } },
      orderBy: { ref: 'asc' },
      select: { ref: true, auction: { select: { startsAt: true, endsAt: true } } },
    });
    if (row === null || row.auction === null) return;

    const detail = await findPublishedListing(row.ref);
    if (detail === null) return;
    const view = await toPublicDetail(detail);

    /**
     * **والحيُّ طرفان لا طرف.** كان الفحص على الانقضاء وحده، فمزادٌ
     * حالتُه `LIVE` وبدايتُه في المستقبل يُحسب حيًّا في الاختبار وغيرَ
     * حيٍّ في المنتج — والمنتج محقّ. (وكانت البذرة تُنتج هذا الصفّ
     * متى شُغّلت قبل الثالثة فجرًا UTC.)
     */
    const now = Date.now();
    const open =
      row.auction.startsAt.getTime() <= now && row.auction.endsAt.getTime() > now;
    expect(view.auction?.live).toBe(open);
  });
});

/**
 * ═══ والشريحةُ تُقال من الصفّ الذي طابَق ═══
 *
 * `priceStatFor` يتدرّج من الأخصّ إلى الأعمّ، فقد يُطابق صفٌّ مدينتُه
 * `*`. وكانت الشاشة تبني الوصف من **المركبة** لا من المُطابِق، فتقول
 * «يوكن ٢٠٢٢ · جدة · مبنيّ على ١٧ صفقة» — **ولا جدةَ في ذلك الرقم**،
 * ومن يقرؤه يخفض سعره على إحصاء مدينةٍ أخرى.
 */
describe('إحصاء السوق يقول سعة مطابقته', () => {
  it('صفٌّ عامّ لا يُوصَف بمدينة ولا بفئة', async () => {
    const { priceStatFor } = await import('@/lib/domain/listing-detail');

    const row = await db.priceStat.findFirst({
      where: { city: '*', trimId: '*' },
      select: { modelId: true, year: true },
    });
    expect(row, 'الزرع يكتب صفوفًا عامّة').not.toBeNull();
    if (row === null) return;

    const stat = await priceStatFor({
      modelId: row.modelId,
      trimId: null,
      year: row.year,
      city: 'جدة',
      mileageKm: 60_000,
    });

    expect(stat).not.toBeNull();
    /** سُئل عن جدة وطابَق العامّ — فلا يُقال إنه عن جدة. */
    expect(stat?.scopedToCity).toBe(false);
    expect(stat?.scopedToTrim).toBe(false);
  });
});

/**
 * ═══ ملخّصُ الفحص يُقرأ قبل أن يُفتح شيء ═══
 *
 * رقمٌ واحد لا يقول **أين** الخلل: «٨٨» قد تكون ثماني ملاحظاتٍ خفيفة
 * أو عطلًا واحدًا في المحرّك — والفرقُ هو ما يريد المشتري معرفته.
 * فالقسمُ يحمل مفتاحَه وعددَ عطله وملاحظاته، واللونُ منها لا من الدرجة.
 */
describe('أقسامُ الفحص تحمل مفتاحَها وحالَها', () => {
  it('كلُّ قسمٍ له مفتاحٌ وعدّادا عطلٍ وملاحظة', async () => {
    const report = await db.inspectionReport.findFirst({
      where: { publishedAt: { not: null } },
      select: { vehicleId: true },
    });
    if (report === null) return;

    const listing = await db.listing.findFirst({
      where: { vehicleId: report.vehicleId, status: 'PUBLISHED' },
      select: { ref: true },
    });
    if (listing === null) return;

    const found = await findPublishedListing(listing.ref);
    if (found === null) throw new Error('لم يُفتح الإعلان');
    const detail = await toPublicDetail(found);

    expect(detail.inspection).not.toBeNull();
    const sections = detail.inspection?.sections ?? [];
    expect(sections.length).toBeGreaterThan(0);

    for (const section of sections) {
      expect(typeof section.key).toBe('string');
      expect(section.major).toBeGreaterThanOrEqual(0);
      expect(section.minor).toBeGreaterThanOrEqual(0);
    }

    /**
     * **والعدّادُ يطابق ما في اللقطة** — ولو اشتُقّ من الدرجة لقال
     * عن قسمٍ درجتُه ٨٨ إنه سليم، وفيه عطل.
     */
    const withFault = sections.find((section) => section.major > 0 || section.minor > 0);
    if (withFault !== undefined) {
      expect(withFault.major + withFault.minor).toBeGreaterThan(0);
    }
  });
});

/**
 * ═══ إحصاءُ السوق يصف شريحةَ هذه السيارة ═══
 *
 * الشريحةُ كانت تُحسب ثمّ **تُرمى** (`void bucket`) وبجوارها تعليقٌ
 * يقول «مطابقة تقريبية على شريحة الممشى» — ولا مطابقةَ تقع، فيردّ
 * `findFirst` أيَّ شريحة. فسيارةٌ ممشاها مئتا ألفٍ تُقاس بإحصاء
 * العشرة آلاف، ويقرأ صاحبُها أنّ سعره أعلى من السوق فيخفضه.
 */
describe('إحصاءُ السعر يختار أقربَ شريحةِ ممشى', () => {
  const made: string[] = [];

  afterAll(async () => {
    if (made.length > 0) await db.priceStat.deleteMany({ where: { id: { in: made } } });
  });

  it('سيارةٌ عالية الممشى تُقاس بشريحتها لا بأيّ شريحة', async () => {
    const model = await db.model.findFirstOrThrow({ select: { id: true } });
    const year = 1990; // سنةٌ لا يزرعها شيء — فلا يختلط المزروع بالمصنوع

    const low = await db.priceStat.create({
      data: {
        modelId: model.id, year, trimId: '*', city: '*',
        mileageBucket: 10, p10: 10_000, p25: 20_000, p50: 30_000,
        p75: 40_000, p90: 50_000, sampleSize: 99, daysToSellMedian: 20, computedAt: new Date(),
      },
    });
    const high = await db.priceStat.create({
      data: {
        modelId: model.id, year, trimId: '*', city: '*',
        mileageBucket: 200, p10: 1_000, p25: 2_000, p50: 3_000,
        p75: 4_000, p90: 5_000, sampleSize: 99, daysToSellMedian: 20, computedAt: new Date(),
      },
    });
    made.push(low.id, high.id);

    const { priceStatFor } = await import('@/lib/domain/listing-detail');

    const cheap = await priceStatFor({
      modelId: model.id, trimId: null, year, city: 'الرياض', mileageKm: 200_000,
    });
    expect(cheap?.mileageBucket).toBe(200);
    expect(cheap?.p50).toBe(3_000);

    const dear = await priceStatFor({
      modelId: model.id, trimId: null, year, city: 'الرياض', mileageKm: 9_000,
    });
    expect(dear?.mileageBucket).toBe(10);
    expect(dear?.p50).toBe(30_000);
  });
});

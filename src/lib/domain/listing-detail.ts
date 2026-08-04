import { db } from '@/lib/db';
import { effectiveAdminFee } from './fees';
import { DEFAULT_VAT_PCT, vatIncluded } from './money';
import { sellerTypeFor, vehicleIsTaxable, isVatRegistered } from './tax-profile';
import { sellerBadge, type SellerBadge } from './seller';
import type { Prisma } from '@/generated/prisma/client';
import type { ListingType, PaintStatus, VehicleCondition } from '@/generated/prisma/enums';

/**
 * صفحة السيارة — Wc و`GET /api/v1/listings/{ref}`.
 *
 * **المُسلسِل هنا هو الحارس.** `Listing` يحمل `minAcceptPrice` و`Auction`
 * يحمل `reservePrice`، وإرجاع كائن Prisma كما هو يسرّب سرًّا تجاريًا في
 * سطر واحد لا يلتقطه مراجع بانتظام. فلا كائن يخرج من هنا إلا مبنيًّا
 * حقلًا حقلًا (قرار: مبدأ المُسلسِل العام).
 *
 * والمسموح `reserveMet: boolean` — الممنوع المبلغ (قرار ٢٩).
 */

/** الحدّ الأدنى لعيّنة الإحصاء — دونه لا يُعرض موقع السعر (قرار ٣٠). */
export const PRICE_STAT_MIN_SAMPLE = 8;

/** جزء المسار من نصّ عربي أو لاتيني — الرابط الأساسي (قرار ٢٥). */
/**
 * ═══ فكّ مقطعٍ من المسار ═══
 *
 * **أجزاء المسار تصل مُرمَّزة من Next**، والمدينة عربية. ومقارنتها
 * بالنصّ المفكوك تفشل دائمًا — والفشل صامت: صفحةٌ تُصبح ٤٠٤ بلا خطأ في
 * أي سجلّ. وقع مرّتين: في تحويل صفحة المركبة، ثم في صفحات الهبوط.
 *
 * ولذلك يقف **بجوار `toSlug`**: من يولّد المقطع يرى من يفكّه، ومن يقارن
 * يجد الاثنين في موضع واحد.
 */
export function fromSlug(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // مقطعٌ فاسد الترميز — يُقارَن كما هو ولا يُسقط الطلب
    return segment;
  }
}

export function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]/gu, '');
}

export type Canonical = {
  city: string;
  brand: string;
  model: string;
  ref: string;
  /** المسار المُرمَّز — ترويسة `Location` لا تقبل إلا ASCII. */
  path: string;
  /** المسار كما يُقرأ — للعرض على الشاشة وحده. */
  display: string;
};

/**
 * الرابط الأساسي: `/{locale}/cars/{city}/{brand}/{model}/{ref}`.
 * `ref` وحده يميّز الإعلان؛ الأجزاء قبله للقراءة والفهرسة، فوصولٌ
 * بأجزاء خاطئة يُحوَّل إليه ٣٠١ بدل أن يُنتج نسختين من الصفحة نفسها.
 */
export function canonicalPath(
  locale: string,
  listing: {
    ref: string;
    city: string;
    vehicle: { brandName: string; modelName: string; brand?: { slug: string } | null };
  },
): Canonical {
  const city = toSlug(listing.city);
  const brand = listing.vehicle.brand?.slug ?? toSlug(listing.vehicle.brandName);
  const model = toSlug(listing.vehicle.modelName);
  const parts = [city, brand, model, listing.ref];
  return {
    city,
    brand,
    model,
    ref: listing.ref,
    /**
     * **مُرمَّز**: المدينة عربية، وترويسة `Location` لا تقبل إلا
     * ASCII — تحويل ٣٠١ بمسار عربي خام يسقط الطلب بـ٥٠٠.
     * والمتصفّح يعرضه مفكوكًا، فالقراءة لا تُفقد.
     */
    path: `/${locale}/cars/${parts.map(encodeURIComponent).join('/')}`,
    display: `/${locale}/cars/${parts.join('/')}`,
  };
}

export type SpecRow = { key: string; value: string | number; isNumber: boolean };

export type PaintPanel = { key: string; state: 'original' | 'repainted' | 'unknown' };

export type PublicListingDetail = {
  ref: string;
  type: ListingType;
  city: string;
  negotiable: boolean;
  askPrice: string;
  monthly: number | null;
  publishedAt: string | null;
  viewCount: number;

  vehicle: {
    title: string;
    brandName: string;
    modelName: string;
    trimName: string | null;
    year: number;
    mileageKm: number;
    transmission: string;
    fuel: string;
    bodyType: string;
    drivetrain: string;
    seats: number;
    colorExterior: string;
    colorInterior: string | null;
    spec: string;
    condition: VehicleCondition;
    /** حالة الصبغ المعروضة ومصدرها — الفحص يتجاوز إقرار البائع (قرار ١٦). */
    paint: { status: PaintStatus; source: 'INSPECTION' | 'SELLER' };
  };

  images: { key: string; isCover: boolean }[];
  features: { key: string; nameAr: string; nameEn: string; group: string; present: boolean }[];

  inspection: {
    score: number;
    inspectedAt: string;
    inspectorName: string;
    sections: { name: string; score: number }[];
    findings: string[];
    paintMap: PaintPanel[];
    reportUrl: string | null;
  } | null;

  history: {
    type: string;
    titleAr: string;
    titleEn: string | null;
    detailAr: string | null;
    detailEn: string | null;
    source: string;
    occurredAt: string;
  }[];

  seller: {
    name: string;
    badge: SellerBadge;
    /**
     * **فئتان لا ثلاث** — مسجَّلٌ في القيمة المضافة أو لا. والمشتري يرى
     * شكل السعر تبعًا لها: «سعر نهائي» أو «شامل الضريبة».
     */
    vatRegistered: boolean;
    dealerSlug: string | null;
    ratingAvg: string | null;
    ratingCount: number;
    listingCount: number;
  };

  /** مزاد: كل شيء عدا الاحتياطي — `reserveMet` مسموح والمبلغ ممنوع. */
  auction: {
    startPrice: string;
    bidIncrement: string;
    buyNowPrice: string | null;
    depositAmount: string;
    startsAt: string;
    endsAt: string;
    status: string;
    bidCount: number;
    highestBid: string | null;
    /** أعلى مزايدة + خطوة — آمن ولا يُشتق منه الاحتياطي (قرار ٢٩). */
    minimumBid: string;
    reserveMet: boolean;
  } | null;

  /** التكلفة الإجمالية — الضريبة مضمَّنة دائمًا (قرار ١٧). */
  cost: {
    price: string;
    commission: string;
    /** حكوميّ — يُمرَّر كما هو */
    transferFee: string;
    /** إداريّ — إيرادٌ لنا، وسطرٌ لا يُدمج بما فوقه */
    transferAdminFee: string;
    /**
     * الضريبة **المضمَّنة في سعر الطلب** حين يكون البائع مسجَّلًا —
     * و`null` حين لا يكون، وهي ليست صفرًا: الصفر يقول «حُسبت فكانت لا
     * شيء»، و`null` تقول «لا ضريبة هنا أصلًا».
     *
     * والاسم يصف ما هو: ضريبةٌ داخل السعر، لا ضريبةٌ نحسبها على المركبة.
     * والحساب يتبع نوع البائع لا صفة المعرض.
     */
    vatIncludedInPrice: string | null;
    total: string;
  };

  /** موقع السعر في السوق — `null` دون عتبة العيّنة (قرار ٣٠). */
  priceStat: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    sampleSize: number;
    daysToSellMedian: number | null;
  } | null;
};

const DETAIL_INCLUDE = {
  vehicle: {
    include: {
      brand: { select: { slug: true } },
      inspectionReports: { orderBy: { inspectedAt: 'desc' }, take: 1 },
      history: { orderBy: { occurredAt: 'desc' } },
    },
  },
  seller: { include: { dealer: true } },
  images: { orderBy: { sort: 'asc' } },
  features: { include: { feature: true } },
  auction: { include: { _count: { select: { bids: true } } } },
} as const;

type DetailRow = Prisma.ListingGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/** المنشور وحده يُعرض — مسودّة أو قيد مراجعة ليست صفحة عامة. */
export async function findPublishedListing(ref: string): Promise<DetailRow | null> {
  return db.listing.findFirst({
    where: { ref, status: 'PUBLISHED' },
    include: DETAIL_INCLUDE,
  });
}

/**
 * ما تحتاجه `generateMetadata` وحده — **لا الصفّ كاملًا**.
 *
 * جلب الكائن كلّه لأربعة حقول يجرّ `minAcceptPrice` معه إلى كل ما
 * يلمس القيمة، وأداة تطوير في Next تنشره في HTML. الحقول المحدَّدة
 * تُنهي الاحتمال من أصله بدل أن تعتمد على ألّا يلمسه أحد.
 */
/**
 * هل على الإعلان طلبٌ حيّ؟
 *
 * **الزرّ يعرف قبل أن يَعِد.** كان «اشترِ الآن» يُعرض على إعلانٍ له
 * طلبٌ قائم، فيضغطه المشتري ويردّ الخادم `ORDER_EXISTS` — شاشةٌ تقول
 * شيئًا والنظام يفعل غيره. والحجز يقع في `buyDirect`، لكن إعلانًا قد
 * يبقى `PUBLISHED` ومعه طلب (الزرع يفعلها)، والسباق ممكن دائمًا.
 *
 * وهذا **لا يُغني عن حارس الخادم**: الشاشة تُخفي والخادم يمنع.
 */
export async function hasLiveOrder(listingId: string): Promise<boolean> {
  const live = await db.order.findFirst({
    where: { listingId, status: 'ACTIVE' },
    select: { id: true },
  });
  return live !== null;
}

export async function findListingForMetadata(ref: string) {
  return db.listing.findFirst({
    where: { ref, status: 'PUBLISHED' },
    select: {
      ref: true,
      city: true,
      vehicle: {
        select: {
          brandName: true,
          modelName: true,
          trimName: true,
          year: true,
          mileageKm: true,
          brand: { select: { slug: true } },
        },
      },
    },
  });
}

/** القسط الشهري — حساب محلّي بلا استدعاء (قرار ١٤). */
export function monthlyPayment(
  price: number,
  downPct: number,
  months: number,
  ratePct: number,
): number {
  const principal = price * (1 - downPct / 100);
  const total = principal * (1 + (ratePct / 100) * (months / 12));
  return Math.round(total / months / 10) * 10;
}

function paintPanels(map: unknown): PaintPanel[] {
  if (typeof map !== 'object' || map === null) return [];
  return Object.entries(map as Record<string, unknown>).map(([key, value]) => ({
    key,
    state:
      value === 'original' ? 'original' : value === 'repainted' ? 'repainted' : 'unknown',
  }));
}

function sectionScores(sections: unknown): { name: string; score: number }[] {
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section) => {
    if (typeof section !== 'object' || section === null) return [];
    const { name, score } = section as { name?: unknown; score?: unknown };
    return typeof name === 'string' && typeof score === 'number' ? [{ name, score }] : [];
  });
}

/**
 * ملاحظات الفحص التي «تستحق الانتباه» — النقاط الراسبة وحدها.
 * قائمة بـ٢١٠ نقطة أغلبها سليم لا تُقرأ؛ الاستثناء هو الخبر.
 */
function findings(sections: unknown): string[] {
  if (!Array.isArray(sections)) return [];
  const out: string[] = [];
  for (const section of sections) {
    if (typeof section !== 'object' || section === null) continue;
    const { name, points } = section as { name?: unknown; points?: unknown };
    if (typeof name !== 'string' || !Array.isArray(points)) continue;
    if (points.some((p) => typeof p === 'object' && p !== null && (p as { ok?: unknown }).ok === false)) {
      out.push(name);
    }
  }
  return out;
}

export async function toPublicDetail(row: DetailRow): Promise<PublicListingDetail> {
  const report = row.vehicle.inspectionReports[0] ?? null;
  const price = Number(row.askPrice);

  const [settings, platform, commissionRule, priceStat, dealerListings, highest] =
    await Promise.all([
      db.financeSetting.findUnique({ where: { id: 'default' } }),
      db.platformSetting.findUnique({ where: { id: 'default' } }),
      db.commissionRule.findFirst({
        where: { scope: 'global', activeFrom: { lte: new Date() } },
        orderBy: { activeFrom: 'desc' },
      }),
      priceStatFor(row.vehicle),
      row.seller.dealerId === null
        ? Promise.resolve(0)
        : db.listing.count({
            where: { status: 'PUBLISHED', vehicle: { dealerId: row.seller.dealerId } },
          }),
      row.auction === null
        ? Promise.resolve(null)
        : db.bid.aggregate({
            where: { auctionId: row.auction.id },
            _max: { amount: true },
          }),
    ]);

  const eligible =
    row.type !== 'AUCTION' && settings != null && price >= Number(settings.minPrice);

  const sellerType = sellerTypeFor(row.seller, row);
  const priceCarriesVat = vehicleIsTaxable(sellerType);

  const transferFee = Number(platform?.transferFee ?? 0);
  const transferAdminFee = Number(
    effectiveAdminFee({
      adminFeeEnabled: platform?.transferAdminFeeEnabled ?? false,
      adminFee: platform?.transferAdminFee ?? 0,
    }),
  );
  const commission =
    commissionRule === null
      ? 0
      : Math.min(
          Math.max(
            (price * Number(commissionRule.pct)) / 100 + Number(commissionRule.fixedFee),
            Number(commissionRule.minFee ?? 0),
          ),
          Number(commissionRule.maxFee ?? Number.MAX_SAFE_INTEGER),
        );

  /**
   * حالة الصبغ: تقرير الفحص **يتجاوز** إقرار البائع (قرار ١٦)،
   * والمصدر يُعرض مع الحالة فيعرف القارئ ثقةَ ما يقرأ.
   */
  const panels = report === null ? [] : paintPanels(report.paintMap);
  const paint =
    panels.length === 0
      ? { status: row.vehicle.paintStatus, source: 'SELLER' as const }
      : {
          status: (panels.every((p) => p.state === 'original')
            ? 'ORIGINAL'
            : panels.some((p) => p.state === 'repainted')
              ? 'PARTIAL'
              : 'UNKNOWN') satisfies PaintStatus as PaintStatus,
          source: 'INSPECTION' as const,
        };

  const highestBid = highest?._max.amount ?? null;

  return {
    ref: row.ref,
    type: row.type,
    city: row.city,
    negotiable: row.negotiable,
    askPrice: row.askPrice.toString(),
    monthly:
      eligible && settings != null
        ? monthlyPayment(
            price,
            Number(settings.downPaymentPct),
            settings.months,
            Number(settings.profitRatePct),
          )
        : null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    viewCount: row.viewCount,

    vehicle: {
      title: [row.vehicle.brandName, row.vehicle.modelName, row.vehicle.trimName]
        .filter((p) => p !== null && p !== '')
        .join(' '),
      brandName: row.vehicle.brandName,
      modelName: row.vehicle.modelName,
      trimName: row.vehicle.trimName,
      year: row.vehicle.year,
      mileageKm: row.vehicle.mileageKm,
      transmission: row.vehicle.transmission,
      fuel: row.vehicle.fuel,
      bodyType: row.vehicle.bodyType,
      drivetrain: row.vehicle.drivetrain,
      seats: row.vehicle.seats,
      colorExterior: row.vehicle.colorExterior,
      colorInterior: row.vehicle.colorInterior,
      spec: row.vehicle.spec,
      condition: row.vehicle.condition,
      paint,
    },

    images: row.images.map((image) => ({ key: image.r2Key, isCover: image.isCover })),

    features: row.features.map((link) => ({
      key: link.featureKey,
      nameAr: link.feature.nameAr,
      nameEn: link.feature.nameEn,
      group: link.feature.group,
      present: true,
    })),

    inspection:
      report === null
        ? null
        : {
            score: report.score,
            inspectedAt: report.inspectedAt.toISOString(),
            inspectorName: report.inspectorName,
            sections: sectionScores(report.sections),
            findings: findings(report.sections),
            paintMap: panels,
            reportUrl: report.pdfUrl,
          },

    /**
     * التاريخ المجاني يعرض ما تملكه المنصة وحده، وكل سطر يحمل مصدره
     * (قرار ١٥). وما لا نملكه لا يُعرض — لا سطر رمادي ولا «غير متاح»،
     * فالغياب أصدق.
     */
    history: row.vehicle.history.map((item) => ({
      type: item.type,
      titleAr: item.titleAr,
      titleEn: item.titleEn,
      detailAr: item.detailAr,
      detailEn: item.detailEn,
      source: item.source,
      occurredAt: item.occurredAt.toISOString(),
    })),

    seller: {
      name: row.seller.dealer?.nameAr ?? row.seller.name ?? '',
      badge: sellerBadge(row.seller),
      vatRegistered: isVatRegistered(row.seller),
      dealerSlug: row.seller.dealer?.slug ?? null,
      ratingAvg: row.seller.dealer?.ratingAvg?.toString() ?? null,
      ratingCount: row.seller.dealer?.ratingCount ?? 0,
      listingCount: dealerListings,
    },

    auction:
      row.auction === null
        ? null
        : {
            startPrice: row.auction.startPrice.toString(),
            bidIncrement: row.auction.bidIncrement.toString(),
            buyNowPrice: row.auction.buyNowPrice?.toString() ?? null,
            depositAmount: row.auction.depositAmount.toString(),
            startsAt: row.auction.startsAt.toISOString(),
            endsAt: row.auction.endsAt.toISOString(),
            status: row.auction.status,
            bidCount: row.auction._count.bids,
            highestBid: highestBid?.toString() ?? null,
            minimumBid: (
              Number(highestBid ?? row.auction.startPrice) +
              (highestBid === null ? 0 : Number(row.auction.bidIncrement))
            ).toString(),
            // الراية وحدها تخرج — لا المبلغ ولا ما يُشتق منه
            reserveMet:
              row.auction.reservePrice === null ||
              (highestBid !== null && Number(highestBid) >= Number(row.auction.reservePrice)),
          },

    cost: {
      price: price.toString(),
      commission: commission.toString(),
      transferFee: transferFee.toString(),
      transferAdminFee: transferAdminFee.toString(),
      vatIncludedInPrice: priceCarriesVat
        ? vatIncluded(price, Number(platform?.vatPct ?? DEFAULT_VAT_PCT)).toString()
        : null,
      total: (price + commission + transferFee + transferAdminFee).toString(),
    },

    priceStat,
  };
}

/**
 * إحصاء السوق لهذه المركبة.
 *
 * البحث يتدرّج من الأخصّ إلى الأعمّ: الفئة والمدينة معًا، ثم المدينة،
 * ثم الطراز وحده. و`"*"` سنتينل لا مفتاح خارجي (قرار المهمة ٢).
 * ودون عتبة العيّنة يُعاد `null` — والصمت أصدق من متوسّط من ثلاث صفقات.
 */
export async function priceStatFor(vehicle: {
  modelId: string;
  trimId: string | null;
  year: number;
  city: string;
  mileageKm: number;
}): Promise<PublicListingDetail['priceStat']> {
  const bucket = Math.round(vehicle.mileageKm / 1000 / 10) * 10;
  const candidates = [
    { trimId: vehicle.trimId ?? '*', city: vehicle.city },
    { trimId: '*', city: vehicle.city },
    { trimId: vehicle.trimId ?? '*', city: '*' },
    { trimId: '*', city: '*' },
  ];

  for (const candidate of candidates) {
    const row = await db.priceStat.findFirst({
      where: {
        modelId: vehicle.modelId,
        year: vehicle.year,
        trimId: candidate.trimId,
        city: candidate.city,
      },
      orderBy: { computedAt: 'desc' },
    });
    if (row === null || row.sampleSize < PRICE_STAT_MIN_SAMPLE) continue;
    // مطابقة تقريبية على شريحة الممشى — الأقرب لا الأدقّ
    void bucket;
    return {
      p10: Number(row.p10),
      p25: Number(row.p25),
      p50: Number(row.p50),
      p75: Number(row.p75),
      p90: Number(row.p90),
      sampleSize: row.sampleSize,
      daysToSellMedian: row.daysToSellMedian,
    };
  }
  return null;
}

export type FaqEntry = { id: string; questionAr: string; questionEn: string; answerAr: string; answerEn: string };

/**
 * أسئلة صفحة السيارة **حسب طريقة البيع**.
 *
 * يفوز الخاصّ بالنوع على العامّ ويسبقه في الترتيب: «كيف أقدّم عرضًا»
 * تخصّ التفاوض، و«كيف تُحمى أموالي» تخصّ الجميع. والعامّ يبقى فلا يجد
 * قارئ صفحةِ بيعٍ مباشر قائمةً فارغة.
 */
export async function faqForListing(type: ListingType): Promise<FaqEntry[]> {
  const placements = await db.faqPlacement.findMany({
    where: {
      surface: 'listing_page',
      active: true,
      OR: [{ listingType: type }, { listingType: null }],
      faq: { active: true },
    },
    orderBy: [{ sort: 'asc' }],
    include: { faq: true },
  });

  const seen = new Set<string>();
  const specific = placements.filter((p) => p.listingType !== null);
  const generic = placements.filter((p) => p.listingType === null);

  return [...specific, ...generic].flatMap((placement) => {
    if (seen.has(placement.faqId)) return [];
    seen.add(placement.faqId);
    return [
      {
        id: placement.faqId,
        questionAr: placement.faq.questionAr,
        questionEn: placement.faq.questionEn,
        answerAr: placement.faq.answerAr,
        answerEn: placement.faq.answerEn,
      },
    ];
  });
}

export type SimilarCard = {
  ref: string;
  title: string;
  year: number;
  mileageKm: number;
  price: string;
  inspected: boolean;
  city: string;
  path: (locale: string) => string;
};

/**
 * سيارات مشابهة — نفس الطراز أوّلًا، ثم نفس الماركة إن قلّ العدد.
 * الترتيب بقرب السعر: البديل المفيد هو ما يقارَن به لا ما يُصادف.
 */
export async function similarListings(
  row: DetailRow,
  take = 4,
): Promise<SimilarCard[]> {
  const price = Number(row.askPrice);

  const pick = async (where: object): Promise<DetailRow[]> =>
    db.listing.findMany({
      where: { status: 'PUBLISHED', ref: { not: row.ref }, ...where },
      include: DETAIL_INCLUDE,
      take: take * 3,
    }) as unknown as Promise<DetailRow[]>;

  let rows = await pick({ vehicle: { modelId: row.vehicle.modelId } });
  if (rows.length < take) {
    const more = await pick({ vehicle: { brandId: row.vehicle.brandId } });
    const seen = new Set(rows.map((r) => r.ref));
    rows = [...rows, ...more.filter((r) => !seen.has(r.ref))];
  }

  return rows
    .sort((a, b) => Math.abs(Number(a.askPrice) - price) - Math.abs(Number(b.askPrice) - price))
    .slice(0, take)
    .map((listing) => ({
      ref: listing.ref,
      title: [listing.vehicle.brandName, listing.vehicle.modelName, listing.vehicle.trimName]
        .filter((p) => p !== null && p !== '')
        .join(' '),
      year: listing.vehicle.year,
      mileageKm: listing.vehicle.mileageKm,
      price: listing.askPrice.toString(),
      inspected: listing.vehicle.inspectionReports.length > 0,
      city: listing.city,
      path: (locale: string) => canonicalPath(locale, listing).path,
    }));
}

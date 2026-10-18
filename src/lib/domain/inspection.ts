import { db } from '@/lib/db';
import { DEADLINE_DEFAULTS } from './deadlines';
import { canonicalPath } from './listing-detail';
import { inspectorCodeFor } from './inspector-code';

/** **ويُعاد تصديرُه** — فنداءاتُه التاريخية تقرؤه من هنا. */
export { inspectorCodeFor } from './inspector-code';

/**
 * تقرير الفحص — Wd.
 *
 * **`sections` عمود `Json`، فالعقد يُفرض هنا لا في المخطط.** ومعنى ذلك
 * أن كل قارئ يجب أن يمرّ بهذا المفكّك: قراءة الحقل مباشرةً في شاشة
 * تعني أن تغييرًا في شكل ما يكتبه مركز الفحص يكسر الشاشة بلا إنذار،
 * بينما المفكّك يُسقط ما لا يفهمه ويُبقي الباقي.
 *
 * والمبدأ في كل حقل: **ما لا نعرفه لا نخترعه** — نقطة بلا ملاحظة
 * تُعرض بلا ملاحظة، لا بنصّ عامّ يوحي بأن الفاحص كتب شيئًا.
 */

/** صلاحية التقرير — ٩٠ يومًا من الفحص. قاعدة محسوبة لا حقل مخزَّن. */
/** الافتراضيّ — والسارية من إعداد الأدمن. */
export const REPORT_VALIDITY_DAYS = DEADLINE_DEFAULTS.reportValidityDays;

/**
 * حالة النقطة.
 *
 * ═══ و`NOT_INSPECTED` ليست ترفًا ═══
 *
 * كان التجميد يكتب **«سليم» لكل بندٍ لم يُجَب عنه** — فبندٌ لم ينظر
 * إليه أحد يُنشر وعدًا للمشتري. واليوم لا يقع (الإرسال مرفوض حتى
 * تُجَب البنود كلُّها)، لكنّه لغمٌ مؤجَّل: أوّلُ بندٍ يصير اختياريًّا،
 * أو بندٌ يُضاف إلى الكتالوج بعد أن فُتحت مسودّة، يُنشر **صمتًا في
 * ثوب إجازة**.
 *
 * ومرجعُ السوق يفصلها صراحةً: «اجتياز» و«لم يتم التحقق بعد» و«يوجد
 * خلل ما» — ثلاثُ علاماتٍ لا اثنتان.
 */
export type PointState = 'OK' | 'NOTE' | 'PAINT' | 'FAIL' | 'NOT_INSPECTED';

export type InspectionPoint = {
  id: string;
  label: string;
  state: PointState;
  /** ملاحظة الفاحص — `null` إن لم يكتب شيئًا. */
  note: string | null;
  /** مفاتيح صور الملاحظة في R2. */
  photos: string[];
};

export type InspectionSection = {
  key: string;
  name: string;
  score: number;
  /** خلاصة القسم بقلم الفاحص. */
  note: string | null;
  points: InspectionPoint[];
};

export type PaintPanelState = 'original' | 'repainted' | 'replaced' | 'unknown';

export type PublicInspectionReport = {
  ref: string;
  score: number;
  /** تسمية الحالة مشتقّة من الدرجة بعتبات ثابتة — لا تُكتب في البيانات. */
  grade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  inspectedAt: string;
  /** محسوبة من تاريخ الفحص، فلا تاريخان يتناقضان. */
  validUntil: string;
  /**
   * **رمزٌ لا اسم** (قرار المالك ٢٠٢٦-١٠-١٨). والاسمُ باقٍ في القاعدة
   * أثرًا يُحتجّ به، ولا يدخل هذا الكائن — فما لا يدخله لا يتسرّب منه.
   */
  inspectorCode: string;
  centreName: string | null;
  pdfUrl: string | null;

  totalPoints: number;
  passedPoints: number;
  /**
   * **ما لم يُفحَص يُعدّ باسمه.** كان المجموع دلوين — سليمٌ وملاحظة —
   * فصار ثلاثة، وتركُ الثالث ضمنيًّا يجعل «٢٠٦ سليمة من ٢١٠» تُقرأ
   * «أربعٌ عليها ملاحظة» وهي أربعٌ **واثنتان لم تُفحصا**.
   */
  notInspectedPoints: number;
  sections: InspectionSection[];
  /** النقاط غير السليمة وحدها — وهي الخبر. */
  findings: InspectionPoint[];
  photos: { key: string; label: string }[];

  paintMap: { key: string; state: PaintPanelState }[];
  paintSummary: string | null;

  vehicle: {
    title: string;
    year: number;
    mileageKm: number;
    /** مقنَّع دائمًا — رقم الهيكل كامل يُمكّن من انتحال المركبة. */
    vinMasked: string | null;
    /**
     * **واللوحةُ من تمام التقرير** (قرار المالك ٢٠٢٦-١٠-١٨): وثيقةٌ تصف
     * مركبةً بعينها ولا تُسمّيها بما يُعرف به في الشارع ناقصة. وهي هنا
     * **بلا شرط `showPlate`**: ذاك اختيارُ عرضٍ في سوقٍ عامّ، وهذه
     * وثيقةٌ عن مركبةٍ يقرؤها من يَعنيه أمرُها.
     */
    plateLetters: string | null;
    plateNumbers: string | null;
  };
  listing: { ref: string; path: string } | null;
};

/** العتبات في مكان واحد فلا تتناقض بين Wc وWd. */
export function gradeOf(score: number): PublicInspectionReport['grade'] {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 80) return 'GOOD';
  if (score >= 60) return 'FAIR';
  return 'POOR';
}

/**
 * رقم الهيكل مقنَّعًا: `JTDBE32K***01847`.
 * الرقم الكامل يُمكّن من انتحال المركبة في استعلامات الطرف الثالث،
 * والمقنَّع يكفي القارئ ليطابق ما بيده.
 */
export function maskVin(vin: string | null): string | null {
  if (vin === null || vin.length < 11) return vin;
  return `${vin.slice(0, 8)}***${vin.slice(-5)}`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function parsePoint(raw: unknown, index: number, sectionKey: string): InspectionPoint | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const point = raw as Record<string, unknown>;

  const label = asString(point.label);
  if (label === null) return null;

  const rawState = asString(point.state);
  const state: PointState =
    rawState === 'NOTE' ||
    rawState === 'PAINT' ||
    rawState === 'FAIL' ||
    rawState === 'NOT_INSPECTED'
      ? rawState
      : point.ok === false
        ? 'NOTE'
        : 'OK';

  return {
    id: asString(point.id) ?? `${sectionKey}-${index}`,
    label,
    state,
    note: asString(point.note),
    photos: Array.isArray(point.photos)
      ? point.photos.filter((photo): photo is string => typeof photo === 'string')
      : [],
  };
}

/** يُسقط ما لا يفهمه ويُبقي الباقي — تقرير ناقص خير من شاشة ساقطة. */
export function parseSections(raw: unknown): InspectionSection[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry, i) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const section = entry as Record<string, unknown>;

    const name = asString(section.name);
    if (name === null) return [];

    const key = asString(section.key) ?? `section-${i}`;
    const points = Array.isArray(section.points)
      ? section.points.flatMap((point, j) => {
          const parsed = parsePoint(point, j, key);
          return parsed === null ? [] : [parsed];
        })
      : [];

    return [
      {
        key,
        name,
        score: typeof section.score === 'number' ? section.score : 0,
        note: asString(section.note),
        points,
      },
    ];
  });
}

export function parsePaintMap(raw: unknown): { key: string; state: PaintPanelState }[] {
  if (typeof raw !== 'object' || raw === null) return [];
  return Object.entries(raw as Record<string, unknown>).flatMap(([key, value]) => {
    if (key === 'summary') return [];
    const state: PaintPanelState =
      value === 'original' || value === 'repainted' || value === 'replaced' ? value : 'unknown';
    return [{ key, state }];
  });
}

const REPORT_INCLUDE = {
  vehicle: {
    select: {
      brandName: true,
      modelName: true,
      trimName: true,
      year: true,
      mileageKm: true,
      vin: true,
      plateLetters: true,
      plateNumbers: true,
      listings: {
        where: { status: 'PUBLISHED' as const },
        take: 1,
        select: {
          ref: true,
          city: true,
          vehicle: {
            select: { brandName: true, modelName: true, brand: { select: { slug: true } },
          model: { select: { nameEn: true } } },
          },
        },
      },
    },
  },
  serviceRequest: { select: { provider: { select: { nameAr: true, nameEn: true } } } },
} as const;

/**
 * ═══ تقريرُ الإعلان — **والدافع يملكه** (قرار المالك ٤) ═══
 *
 * > «تقرير البائع عامٌّ على الإعلان، وتقرير المشتري خاصٌّ به حتى
 * > يشاركه أو يشتريه البائع.»
 *
 * وكانت الدالّة تُعيد **أيَّ** تقريرٍ على المركبة لكل زائر: فمشترٍ
 * دفع أربعمئة وخمسين ريالًا ليعرف حال سيارةٍ قبل شرائها **ينشر ما
 * اشتراه** للبائع ولمن ينافسه عليها. ولا خصوصيةَ لمن دفع، ولا سببَ
 * لأحدٍ أن يدفع بعدها.
 *
 * فالشرط اثنان: المنشور يراه الجميع، وغيرُ المنشور يراه **دافعُه
 * وحده**. والأقربُ أوّلًا: من له تقريرُه يرى تقريرَه لا تقرير غيره.
 */
export async function findReportByListingRef(listingRef: string, viewerId: string | null) {
  const onListing = { listings: { some: { ref: listingRef, status: 'PUBLISHED' as const } } };

  if (viewerId !== null) {
    const own = await db.inspectionReport.findFirst({
      where: { vehicle: onListing, serviceRequest: { userId: viewerId } },
      orderBy: { inspectedAt: 'desc' },
      include: REPORT_INCLUDE,
    });
    if (own !== null) return own;
  }

  return db.inspectionReport.findFirst({
    where: { vehicle: onListing, publishedAt: { not: null } },
    orderBy: { inspectedAt: 'desc' },
    include: REPORT_INCLUDE,
  });
}

/**
 * أيُنشَر التقرير لحظةَ صدوره؟ — **نعم إن طلبه مالكُ المركبة**.
 *
 * والقاعدة هنا لا في كاتبٍ بعينه: الزرع يكتب تقارير اليوم، وبانيها
 * سيكتبها غدًا — ونسختان من الشرط تتباعدان أوّل تعديل.
 */
export function publishOnIssue(requesterId: string, vehicleOwnerId: string): boolean {
  return requesterId === vehicleOwnerId;
}

type ReportRow = NonNullable<Awaited<ReturnType<typeof findReportByListingRef>>>;

export function toPublicReport(
  row: ReportRow,
  locale: string,
): PublicInspectionReport {
  const sections = parseSections(row.sections);
  const points = sections.flatMap((section) => section.points);
  const paintMap = parsePaintMap(row.paintMap);

  const validUntil = new Date(row.inspectedAt);
  validUntil.setDate(validUntil.getDate() + REPORT_VALIDITY_DAYS);

  /**
   * **وما لا ينطبق ليس ملاحظة.** «الخبر» هو ما وجده الفاحصُ على
   * المركبة — وبندٌ أعلن أنه لا ينطبق (توربو في محرّكٍ بلا توربو)
   * يُحشر في «ما يستحقّ الانتباه» فيُقلق على لا شيء، ويُطيل قائمةً
   * قيمتُها في قِصَرها.
   */
  const findings = points.filter(
    (point) => point.state !== 'OK' && point.state !== 'NOT_INSPECTED',
  );
  const listing = row.vehicle.listings[0] ?? null;

  const summary =
    typeof row.paintMap === 'object' && row.paintMap !== null
      ? asString((row.paintMap as Record<string, unknown>).summary)
      : null;

  return {
    ref: row.ref,
    score: row.score,
    grade: gradeOf(row.score),
    inspectedAt: row.inspectedAt.toISOString(),
    validUntil: validUntil.toISOString(),
    /** و`null` لصفٍّ سبق العمود — فيُشتقّ عند القراءة ولا يُعرض فارغًا. */
    inspectorCode: row.inspectorCode ?? inspectorCodeFor(row.inspectorName),
    centreName: row.serviceRequest.provider?.nameAr ?? null,
    pdfUrl: row.pdfUrl,

    totalPoints: points.length,
    passedPoints: points.filter((point) => point.state === 'OK').length,
    notInspectedPoints: points.filter((point) => point.state === 'NOT_INSPECTED').length,
    sections,
    findings,
    photos: findings.flatMap((finding) =>
      finding.photos.map((key) => ({ key, label: finding.label })),
    ),

    paintMap,
    paintSummary: summary,

    vehicle: {
      title: [row.vehicle.brandName, row.vehicle.modelName, row.vehicle.trimName]
        .filter((part) => part !== null && part !== '')
        .join(' '),
      year: row.vehicle.year,
      mileageKm: row.vehicle.mileageKm,
      vinMasked: maskVin(row.vehicle.vin),
      plateLetters: row.vehicle.plateLetters,
      plateNumbers: row.vehicle.plateNumbers,
    },
    listing:
      listing === null
        ? null
        : { ref: listing.ref, path: canonicalPath(locale, listing).path },
  };
}


/**
 * مرجعُ التقرير المنشور لإعلانٍ — **للعنوان وحده**.
 *
 * ولا تُستعمل `findReportByListingRef` لذلك: تلك تجلب التقريرَ كاملًا
 * بأقسامه ومركبته لتُبنى منه صفحة، وعنوانُ تبويبٍ لا يحتاج إلّا سطرًا.
 * **وما يُجلَب يُسلسَل ولو لم يُرسَم** — فالقاعدة أن يُطلب ما يُستعمل.
 */
export async function inspectionRefForListing(listingRef: string): Promise<string | null> {
  const row = await db.inspectionReport.findFirst({
    where: {
      publishedAt: { not: null },
      vehicle: { listings: { some: { ref: listingRef } } },
    },
    orderBy: { inspectedAt: 'desc' },
    select: { ref: true },
  });
  return row?.ref ?? null;
}

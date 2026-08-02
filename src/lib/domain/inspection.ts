import { db } from '@/lib/db';
import { canonicalPath } from './listing-detail';

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
export const REPORT_VALIDITY_DAYS = 90;

/** حالة النقطة. `OK` هي الغالبية العظمى ولا تُعرض في جدول الملاحظات. */
export type PointState = 'OK' | 'NOTE' | 'PAINT' | 'FAIL';

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
  inspectorName: string;
  centreName: string | null;
  pdfUrl: string | null;

  totalPoints: number;
  passedPoints: number;
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
    rawState === 'NOTE' || rawState === 'PAINT' || rawState === 'FAIL'
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
      listings: {
        where: { status: 'PUBLISHED' as const },
        take: 1,
        select: {
          ref: true,
          city: true,
          vehicle: {
            select: { brandName: true, modelName: true, brand: { select: { slug: true } } },
          },
        },
      },
    },
  },
  serviceRequest: { select: { provider: { select: { nameAr: true, nameEn: true } } } },
} as const;

export async function findReportByListingRef(listingRef: string) {
  return db.inspectionReport.findFirst({
    where: { vehicle: { listings: { some: { ref: listingRef, status: 'PUBLISHED' } } } },
    orderBy: { inspectedAt: 'desc' },
    include: REPORT_INCLUDE,
  });
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

  const findings = points.filter((point) => point.state !== 'OK');
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
    inspectorName: row.inspectorName,
    centreName: row.serviceRequest.provider?.nameAr ?? null,
    pdfUrl: row.pdfUrl,

    totalPoints: points.length,
    passedPoints: points.filter((point) => point.state === 'OK').length,
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
    },
    listing:
      listing === null
        ? null
        : { ref: listing.ref, path: canonicalPath(locale, listing).path },
  };
}

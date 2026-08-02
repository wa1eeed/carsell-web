import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  REPORT_VALIDITY_DAYS,
  findReportByListingRef,
  gradeOf,
  maskVin,
  parsePaintMap,
  parseSections,
  toPublicReport,
} from '@/lib/domain/inspection';

afterAll(async () => {
  await db.$disconnect();
});

const anyInspected = async (): Promise<string> => {
  const row = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED', vehicle: { inspectionReports: { some: {} } } },
    select: { ref: true },
  });
  return row.ref;
};

describe('٢١٠ نقطة من قاعدة البيانات', () => {
  it('كل تقرير يحمل ٢١٠ نقطة، ولكل نقطة اسم', async () => {
    const reports = await db.inspectionReport.findMany();
    expect(reports.length).toBeGreaterThan(0);

    for (const report of reports) {
      const sections = parseSections(report.sections);
      const points = sections.flatMap((section) => section.points);

      expect(points.length, report.ref).toBe(210);
      for (const point of points) {
        // «الهيكل والصبغ-١٧» لا يقول لمشترٍ شيئًا
        expect(point.label, point.id).not.toMatch(/-\d+$/);
        expect(point.label.trim().length).toBeGreaterThan(2);
      }
    }
  });

  it('السليم والملاحظ يجمعان إلى المجموع', async () => {
    const report = toPublicReport((await findReportByListingRef(await anyInspected()))!, 'ar');
    expect(report.passedPoints + report.findings.length).toBe(report.totalPoints);
    expect(report.findings.length).toBeGreaterThan(0);
    for (const finding of report.findings) expect(finding.state).not.toBe('OK');
  });

  it('كل صورة تحمل اسم بندها — صورة بلا سياق لا تُثبت شيئًا', async () => {
    const report = toPublicReport((await findReportByListingRef(await anyInspected()))!, 'ar');
    for (const photo of report.photos) {
      expect(photo.label.trim()).not.toBe('');
      expect(report.findings.some((f) => f.label === photo.label)).toBe(true);
    }
  });
});

describe('المفكّك يصمد أمام ما لا يفهمه', () => {
  /**
   * `sections` عمود `Json`، فتغيير شكل ما يكتبه مركز الفحص يجب أن
   * يُسقط ما لا يُفهم لا أن يُسقط الشاشة.
   */
  it('يُسقط الفاسد ويُبقي الصالح', () => {
    const parsed = parseSections([
      null,
      'نصّ',
      { score: 90 },
      { name: 'المحرك', score: 96, points: [{ label: 'ضغط الأسطوانات' }, null, 7] },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.points).toHaveLength(1);
    expect(parsed[0]?.points[0]?.state).toBe('OK');
  });

  it('لا ينهار على مدخل غير مصفوفة', () => {
    expect(parseSections(null)).toEqual([]);
    expect(parseSections({})).toEqual([]);
    expect(parsePaintMap(null)).toEqual([]);
  });

  it('«لم يُقس» ليست «أصلي»', () => {
    const map = parsePaintMap({ hood: 'original', roof: 'مجهول', trunk: 'repainted' });
    expect(map.find((p) => p.key === 'roof')?.state).toBe('unknown');
    expect(map.find((p) => p.key === 'hood')?.state).toBe('original');
    // الخلاصة ليست لوحة
    expect(parsePaintMap({ summary: 'نصّ', hood: 'original' })).toHaveLength(1);
  });
});

describe('ما لا يخرج', () => {
  /** الرقم الكامل يُمكّن من انتحال المركبة في استعلامات الطرف الثالث. */
  it('رقم الهيكل مقنَّع دائمًا', async () => {
    const report = toPublicReport((await findReportByListingRef(await anyInspected()))!, 'ar');
    const vin = await db.vehicle.findFirstOrThrow({
      where: { inspectionReports: { some: { ref: report.ref } } },
      select: { vin: true },
    });

    if (vin.vin !== null && vin.vin.length >= 11) {
      expect(report.vehicle.vinMasked).not.toBe(vin.vin);
      expect(report.vehicle.vinMasked).toContain('***');
    }
    expect(JSON.stringify(report)).not.toContain('reservePrice');
  });

  it('التقنيع يُبقي ما يكفي للمطابقة', () => {
    expect(maskVin('JTDBE32K1234501847')).toBe('JTDBE32K***01847');
    expect(maskVin(null)).toBeNull();
    // أقصر من أن يُقنَّع — يُعاد كما هو لا يُقطَّع
    expect(maskVin('ABC123')).toBe('ABC123');
  });
});

describe('الدرجة والصلاحية', () => {
  it('العتبات في مكان واحد فلا تتناقض بين Wc وWd', () => {
    expect(gradeOf(92)).toBe('EXCELLENT');
    expect(gradeOf(90)).toBe('EXCELLENT');
    expect(gradeOf(89)).toBe('GOOD');
    expect(gradeOf(80)).toBe('GOOD');
    expect(gradeOf(79)).toBe('FAIR');
    expect(gradeOf(60)).toBe('FAIR');
    expect(gradeOf(59)).toBe('POOR');
  });

  it('الصلاحية محسوبة من تاريخ الفحص لا مخزَّنة — فلا تاريخان يتناقضان', async () => {
    const report = toPublicReport((await findReportByListingRef(await anyInspected()))!, 'ar');
    const gap =
      (new Date(report.validUntil).getTime() - new Date(report.inspectedAt).getTime()) /
      (24 * 3600 * 1000);
    expect(Math.round(gap)).toBe(REPORT_VALIDITY_DAYS);
  });
});

'use client';

import { useTranslations } from 'next-intl';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { LicensePlate } from '@/components/ui/plate/LicensePlate';
import {
  BodyDiagram,
  FindingsTable,
  PhotoGrid,
  SectionScores,
} from '@/components/ui/InspectionReport';
import { Quantity } from '@/components/ui/Quantity';
import { ScoreRing } from '@/components/ui/ScoreRing';
import type { PublicInspectionReport } from '@/lib/domain/inspection';

/**
 * Wd — تقرير الفحص.
 *
 * **تنزيل PDF بالطباعة لا بمولّد على الخادم.** مولّد PDF عربي يحتاج
 * تضمين خطّ وتشكيل حروف واتجاه — وكلٌّ منها موضع خطأ صامت يُخرج تقريرًا
 * بحروف مقطّعة. وطباعة المتصفّح تعرف العربية أصلًا، وتُنتج ملفًا يطابق
 * ما رآه القارئ حرفًا بحرف. وإن رفع مركز الفحص ملفه الرسمي فهو الأولى،
 * فيُقدَّم عليه.
 */
export function InspectionScreen({
  report,
  expired,
  diagram,
  formatted,
}: {
  report: PublicInspectionReport;
  expired: boolean;
  /** رسم المصمّم — `null` حتى يصل، فيُعرض التخطيط البديل. */
  diagram: string | null;
  /** التواريخ تُصاغ على الخادم — لا اختلاف بين ما يُقدَّم وما يُروى. */
  formatted: { inspectedAt: string; validUntil: string };
}) {
  const t = useTranslations('ui');

  /**
   * **ومسارُ الورقة من مسار الإعلان** — فرعٌ منه، فلا يُبنى بيدٍ هنا
   * ويتباعد عمّا يقوله `canonicalPath`.
   */
  const sheetPath =
    report.listing === null ? null : `${report.listing.path}/inspection/pdf`;

  const meta = [
    { key: 'centre', label: t('inspectionCentre'), value: report.centreName, ltr: false },
    /** **رمزٌ لا اسم** — ويُعزل اتجاهُه: `FA-7K4M` يُقارن خانةً بخانة. */
    { key: 'inspector', label: t('inspectorCode'), value: report.inspectorCode, ltr: true },
    { key: 'date', label: t('inspectionDate'), value: formatted.inspectedAt, ltr: false },
    { key: 'validity', label: t('reportValidity'), value: formatted.validUntil, ltr: false },
  ].filter((entry) => entry.value !== null);

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center gap-9 rounded-2xl border border-line bg-surface p-8 print:border-0 print:p-0">
        <ScoreRing score={report.score} size="lg" className="shrink-0" />

        <div className="min-w-64 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <h1 className="flex flex-wrap items-baseline gap-2 text-3xl font-bold">
              {t('inspectionTitle')}
              <span className="text-lg font-medium opacity-70">
                <Quantity unit="points" count={report.totalPoints} />
              </span>
            </h1>
            <Badge tone={expired ? 'warn' : 'accent'}>{t(`grade.${report.grade}`)}</Badge>
          </div>

          <p className="mb-4 flex flex-wrap items-center gap-2 text-sm opacity-75">
            <span className="bidi-isolate">{report.vehicle.title}</span>
            <ArabicNumber value={report.vehicle.year} grouped={false} />
            <span aria-hidden className="opacity-35">·</span>
            <Quantity unit="km" count={report.vehicle.mileageKm} />
            {report.vehicle.vinMasked === null ? null : (
              <>
                <span aria-hidden className="opacity-35">·</span>
                <span className="flex items-center gap-1.5">
                  {t('vin')}
                  <span className="font-num bidi-ltr">{report.vehicle.vinMasked}</span>
                </span>
              </>
            )}
          </p>

          {/* واللوحةُ مع هويّة المركبة — كما في ورقة الطباعة سواءً. */}
          {report.vehicle.plateLetters === null ? null : (
            <div className="mb-5 w-56">
              <LicensePlate
                letters={report.vehicle.plateLetters}
                numbers={report.vehicle.plateNumbers}
                size="fill"
              />
            </div>
          )}

          <dl className="flex flex-wrap gap-8">
            {meta.map((entry) => (
              <div key={entry.key}>
                {/* العنوانُ عريضٌ والقيمةُ خفيفة — كما في ورقة الطباعة سواءً. */}
                <dt className="mb-1 text-3xs font-bold">{entry.label}</dt>
                <dd
                  {...(entry.ltr === true ? { dir: 'ltr' as const } : {})}
                  className={
                    entry.ltr === true
                      ? 'font-num bidi-ltr text-xs opacity-80'
                      : 'bidi-isolate text-xs opacity-80'
                  }
                >
                  {entry.value}
                </dd>
              </div>
            ))}
            <div>
              <dt className="mb-1 text-3xs font-bold">{t('reportNumber')}</dt>
              <dd className="font-num bidi-ltr text-xs opacity-80">{report.ref}</dd>
            </div>
          </dl>
        </div>

        <div className="flex shrink-0 flex-col gap-2 print:hidden">
          {/*
            **وليست طباعةَ هذه الصفحة.** كان الزرّ ينادي `window.print()`
            هنا، فيخرج ما على الشاشة على ورق: ترويسةُ الموقع وتبويباتٌ
            وخلفياتٌ تُستهلك حبرًا. وصار يفتح **ورقةً مصمَّمة** مقاسُها
            A4، فيها كرتُ المركبة ورمزُه — وهي تفتح حوار الحفظ بنفسها.
          */}
          {sheetPath === null ? null : (
            <LinkButton href={sheetPath} target="_blank" rel="noopener" className="w-full">
              {t('downloadPdf')}
            </LinkButton>
          )}
          {report.listing === null ? null : (
            <LinkButton href={report.listing.path} variant="outline" className="w-full">
              {t('backToListing')}
            </LinkButton>
          )}
        </div>
      </header>

      {/* الصلاحية تُقال ولا تُخفى — تقرير عمره ستّة أشهر لا يصف اليوم */}
      {!expired ? null : (
        <p className="mb-8 rounded-xl border border-warn-200 bg-warn-100 p-4.5 text-sm text-warn-900">
          <span className="block font-bold">{t('reportExpired')}</span>
          <span className="mt-1 block opacity-85">{t('reportExpiredBody')}</span>
        </p>
      )}

      <div className="mb-10 flex flex-col gap-10 lg:flex-row">
        <BodyDiagram
          panels={report.paintMap}
          summary={report.paintSummary}
          diagram={diagram}
          className="w-full shrink-0 lg:w-[420px]"
        />

        <section className="min-w-0 flex-1">
          <h2 className="mb-2 text-base font-bold">{t('sectionScores')}</h2>
          <SectionScores sections={report.sections} />
        </section>
      </div>

      <FindingsTable sections={report.sections} className="mb-10 border-t border-line pt-9" />

      <PhotoGrid photos={report.photos} className="border-t border-line pt-9" />
    </>
  );
}

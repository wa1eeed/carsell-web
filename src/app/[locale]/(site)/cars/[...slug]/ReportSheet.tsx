'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Logo } from '@/components/ui/Logo';
import { Quantity } from '@/components/ui/Quantity';
import type { InspectionSection, PointState, PublicInspectionReport } from '@/lib/domain/inspection';

/**
 * ═══ ورقةُ التقرير — تقريرٌ مصمَّم لا صفحةٌ مطبوعة ═══
 *
 * قرار المالك ٢٠٢٦-١٠-١٨: «يجب ان يكون البي دي اف مصمم بعنايه … كأنه
 * تقرير بي دي اف مصمم … يحتوي على مستطيل في مقدمه الصفحة ككرت معلومات
 * السيارة و بجانبه QR كود يقود لرابط السياره».
 *
 * وكان الزرّ ينادي `window.print()` على صفحة الويب نفسها: ترويسةُ
 * الموقع، وأعمدةٌ تنكسر، وألوانٌ لا تُطبع — صورةُ شاشةٍ على ورق.
 *
 * ═══ ولماذا HTML للطباعة لا مُولِّد PDF ═══
 *
 * العربيةُ تحتاج **تشكيلَ حروفٍ ووصلًا** (shaping + bidi)، ومكتباتُ
 * الـPDF في Node لا تفعله — فتخرج الحروفُ منفصلةً معكوسة. والمتصفّحُ
 * يُشكّلها يقينًا لأنه يرسمها كل يوم. وخادمٌ بلا متصفّحٍ مُضمَّن أخفُّ
 * من صورةٍ تحمل Chromium كاملًا (٣٠٠ ميغابايت) — وقد مات بناءٌ عندنا
 * مرّةً على نفاد القرص.
 *
 * فهذه صفحةٌ **مقاسُها A4 وتصميمُها تقرير**: لا ترويسةَ موقع، ولا
 * تبويبات، ولا ألوانَ خلفية تُستهلك حبرًا — وتُحفظ PDF بمحرّك المتصفّح.
 */

const MARK: Record<PointState, { glyph: string; tone: string; label: string }> = {
  OK: { glyph: '✓', tone: 'ok', label: 'سليم' },
  NOTE: { glyph: '!', tone: 'note', label: 'ملاحظة' },
  PAINT: { glyph: '!', tone: 'note', label: 'صبغ' },
  FAIL: { glyph: '!', tone: 'fail', label: 'يحتاج إصلاحًا' },
  NOT_INSPECTED: { glyph: '–', tone: 'none', label: 'لم يُفحَص' },
};

const PANEL_LABEL: Record<string, string> = {
  original: 'أصلي',
  repainted: 'مصبوغ',
  replaced: 'مستبدل',
  unknown: 'غير مقاس',
};

export function ReportSheet({
  report,
  formatted,
  qr,
  listingUrl,
  expired,
}: {
  report: PublicInspectionReport;
  formatted: { inspectedAt: string; validUntil: string };
  /** رُسم على الخادم — فلا تُحمَّل حزمةُ ترميزٍ في متصفّح القارئ. */
  qr: string | null;
  listingUrl: string | null;
  expired: boolean;
}) {
  /**
   * **وتُفتح على حوار الحفظ.** الزرُّ يقول «تحميل PDF»، فصفحةٌ تُفتح
   * وتنتظر أن يبحث القارئ عن «طباعة» تُخلف ما وعد به. والانتظارُ حتى
   * تُحمَّل الخطوط: طباعةٌ قبلها تُخرج صفحةً بخطٍّ بديل.
   */
  useEffect(() => {
    let cancelled = false;
    const open = (): void => {
      if (!cancelled) window.print();
    };
    const fonts: FontFaceSet | undefined = document.fonts;
    if (fonts === undefined) {
      open();
    } else {
      void fonts.ready.then(() => window.setTimeout(open, 180));
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const tp = useTranslations('ui.panel');

  const counts = {
    ok: report.passedPoints,
    flagged: report.findings.length,
    none: report.notInspectedPoints,
  };

  return (
    <main className="sheet">
      {/* ═══ كرتُ المركبة — مستطيلٌ في صدر الصفحة، والرمزُ بجانبه ═══ */}
      <header className="card">
        <div className="brand">
          <span className="wordmark">CARZ</span>
          <span className="kicker">تقرير فحص فنّي معتمد</span>
          {/*
            **والشعارُ مكوّنٌ واحد** — لا صورةٌ تُستدعى بمسارها هنا،
            فملفُّه يتبدّل مرّةً ويصل كلَّ شاشةٍ وورقة.
          */}
          {/*
            ═══ واسمُه `brandmark` لا `mark` ═══

            سمّيتُه `mark` فورث قاعدةَ **علامات الحالة** (`.sheet .mark`):
            قرصًا ٣٫٦مم بحدٍّ دائريّ. فخرج الشعارُ ١٤ بكسلًا مربّعًا، ثمّ
            — لمّا أُعطي عرضًا — **داخل إطارٍ دائريّ** لم يطلبه أحد.
            وظننتُها أوّلًا مغالبةَ أصنافٍ مع Tailwind، وهي تصادمُ اسمٍ
            في ملفّي أنا. **والاسمُ العامّ في ورقةٍ صغيرة يصطدم.**
          */}
          <Logo className="brandmark" />
        </div>

        <div className="identity">
          <h1>{report.vehicle.title}</h1>
          <p className="facts">
            <ArabicNumber value={report.vehicle.year} grouped={false} />
            <span className="dot">·</span>
            <Quantity unit="km" count={report.vehicle.mileageKm} />
            {report.vehicle.vinMasked === null ? null : (
              <>
                <span className="dot">·</span>
                <span>
                  رقم الهيكل <bdi className="mono">{report.vehicle.vinMasked}</bdi>
                </span>
              </>
            )}
          </p>
          <dl className="meta">
            <div>
              <dt>رقم التقرير</dt>
              <dd className="mono">{report.ref}</dd>
            </div>
            <div>
              <dt>مركز الفحص</dt>
              <dd>{report.centreName ?? '—'}</dd>
            </div>
            <div>
              <dt>رقم الفاحص</dt>
              <dd className="mono">{report.inspectorCode}</dd>
            </div>
            <div>
              <dt>تاريخ الفحص</dt>
              <dd>{formatted.inspectedAt}</dd>
            </div>
            <div>
              <dt>صلاحية التقرير</dt>
              <dd>{formatted.validUntil}</dd>
            </div>
          </dl>
        </div>

        <div className="score">
          <span className="value">
            <ArabicNumber value={report.score} grouped={false} />
          </span>
          {/*
            **ورقمان بصيغتين في سطرٍ واحد.** كتبتُ «من ١٠٠» بالخانات
            العربية-الهندية والدرجةُ فوقها تُصيَّر بما تُصيّره
            `ArabicNumber` — فصيغتان لمقياسٍ واحد. والرقمُ يمرّ بها دائمًا.
          */}
          <span className="of">
            من <ArabicNumber value={100} grouped={false} />
          </span>
          <span className={`grade grade-${report.grade.toLowerCase()}`}>
            {report.grade === 'EXCELLENT'
              ? 'ممتازة'
              : report.grade === 'GOOD'
                ? 'جيدة'
                : report.grade === 'FAIR'
                  ? 'مقبولة'
                  : 'دون المقبول'}
          </span>
        </div>

        {/*
          **والرمزُ يقود إلى الإعلان لا إلى التقرير**: من يمسحه ورقةً في
          يده يريد السيارة — سعرَها وصورَها وهل بقيت معروضة. والتقريرُ
          بين يديه أصلًا.
        */}
        <div className="qr">
          {qr === null ? (
            <span className="qr-missing">لا رابط — الإعلان غير منشور</span>
          ) : (
            <>
              <span className="qr-box" dangerouslySetInnerHTML={{ __html: qr }} />
              <span className="qr-cap">امسح لفتح الإعلان</span>
              {listingUrl === null ? null : <span className="qr-url mono">{listingUrl}</span>}
            </>
          )}
        </div>
      </header>

      {expired ? (
        <p className="banner">
          انقضت صلاحيةُ هذا التقرير — وما فيه يصف المركبة يوم فُحصت لا اليوم.
        </p>
      ) : null}

      {/* ═══ الخلاصة: ثلاثةُ أرقامٍ ومخطّطُ الهيكل ═══ */}
      <section className="summary">
        <ul className="tallies">
          <li>
            <span className={`mark ok`}>✓</span>
            <span className="n">
              <ArabicNumber value={counts.ok} />
            </span>
            <span className="t">بندًا سليمًا</span>
          </li>
          <li>
            <span className={`mark note`}>!</span>
            <span className="n">
              <ArabicNumber value={counts.flagged} />
            </span>
            <span className="t">عليه ملاحظة</span>
          </li>
          <li>
            <span className={`mark none`}>–</span>
            <span className="n">
              <ArabicNumber value={counts.none} />
            </span>
            <span className="t">لم يُفحَص</span>
          </li>
          <li className="total">
            <span className="n">
              <ArabicNumber value={report.totalPoints} />
            </span>
            <span className="t">مجموع البنود</span>
          </li>
        </ul>

        <div className="scores">
          {report.sections.map((section) => (
            <div key={section.key} className="bar">
              <span className="bname">{section.name}</span>
              <span className="track">
                <span className="fill" style={{ width: `${String(section.score)}%` }} />
              </span>
              <span className="bval mono">
                <ArabicNumber value={section.score} grouped={false} />
              </span>
            </div>
          ))}
        </div>
      </section>

      {report.paintMap.length === 0 ? null : (
        <section className="panels">
          <h2>الهيكل الخارجي — حالُ كل قطعة</h2>
          {report.paintSummary === null ? null : <p className="pnote">{report.paintSummary}</p>}
          <ul>
            {report.paintMap.map((panel) => (
              <li key={panel.key} className={panel.state}>
                {/*
                  **ولا مفتاحٌ خامّ على ورق.** كانت تُطبع `rearBumper`
                  في تقريرٍ يقرؤه مشترٍ عربيّ — والتسميةُ موجودةٌ في
                  `ui.panel` منذ بُني المخطّط، وهذه الورقةُ وحدها لم
                  تقرأها. وهو صنفُ «قيمةٌ بلا تسمية» بوجهه الورقيّ.
                */}
                <span className="pk">{tp(panel.key)}</span>
                <span className="pv">{PANEL_LABEL[panel.state] ?? panel.state}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.findings.length === 0 ? null : (
        <section className="findings">
          <h2>
            ما يستحقّ الانتباه
            <span className="count">
              <ArabicNumber value={report.findings.length} />
            </span>
          </h2>
          <ul>
            {report.findings.map((point) => (
              <li key={point.id}>
                <span className={`mark ${MARK[point.state].tone}`}>{MARK[point.state].glyph}</span>
                <span className="fbody">
                  <b>{point.label}</b>
                  <span className="fstate">{MARK[point.state].label}</span>
                  {point.note === null ? null : <span className="fnote">{point.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ═══ وكلُّ البنود بأقسامها — وهي متنُ التقرير ═══ */}
      <section className="all">
        <h2>البنود المفحوصة بالتفصيل</h2>
        {report.sections.map((section) => (
          <Section key={section.key} section={section} />
        ))}
      </section>

      <footer className="foot">
        <span>
          صدر هذا التقرير من منصّة كارز · <bdi className="mono">carz.sa</bdi>
        </span>
        <span>
          يصف التقريرُ حالَ المركبة يوم فُحصت، ولا يُغني عن المعاينة. ورقمُ الفاحص يُطابَق
          لدى المنصّة.
        </span>
      </footer>
    </main>
  );
}

function Section({ section }: { section: InspectionSection }) {
  const rows = [...section.points].sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  return (
    <div className="sect">
      <h3>
        {section.name}
        <span className="sval mono">
          <ArabicNumber value={section.score} grouped={false} />
        </span>
      </h3>
      <ul>
        {rows.map((point) => (
          /*
            **والبندُ الموسوم يأخذ السطر كلَّه.** الشبكةُ ثلاثةُ أعمدة،
            وملاحظةُ فاحصٍ في ثلثِ عرضٍ تتكسّر كلمةً في كل سطر فتختلط
            باسم البند — قِيس على الورقة فظهر «مساعدملاحظة … أمامي …
            أيسر». فما عليه خبرٌ يمتدّ، والسليمُ يبقى في عموده.
          */
          <li key={point.id} className={point.state === 'OK' ? undefined : 'flagged'}>
            <span className={`mark ${MARK[point.state].tone}`}>{MARK[point.state].glyph}</span>
            <span className="pl">{point.label}</span>
            {point.state === 'OK' ? null : (
              <span className="pn">
                <span className="plabel">{MARK[point.state].label}</span>
                {point.note === null ? null : point.note}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const ORDER: Record<PointState, number> = {
  FAIL: 0,
  NOT_INSPECTED: 1,
  PAINT: 2,
  NOTE: 3,
  OK: 4,
};

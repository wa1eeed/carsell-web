import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { RECON_NEVER_LABEL, RECON_STATUS_LABEL } from '@/lib/labels/admin';
import type { ReconciliationSummary } from '@/lib/domain/reconciliation';

/**
 * ═══ المطابقة مع البوّابات — لوحةُ A25 اليمنى ═══
 *
 * الترميز يضع لكلّ بوّابة سطرًا بحالها، وتحتها سطرًا يقول ما يقع عند
 * الفرق: «أي فرق يُصعَّد كتنبيه بجدول المعاملات المختلفة وحدها — لا
 * بالمجاميع». **وهذا مبنيٌّ فعلًا** (`Mismatch[]` في كلّ صفّ مطابقة،
 * يفتحها جدول A20) — فالسطر وعدٌ يُنفَّذ، لا وصفٌ لنيّة.
 *
 * ═══ ولماذا صفٌّ واحد لكلّ بوّابة ═══
 *
 * `listRuns` تعيد سجلَّ أربعة عشر يومًا، وهو جوابُ «كيف كان الأسبوع؟».
 * وسؤالُ هذه اللوحة «أين نحن الآن؟» — فأحدثُ صفٍّ لكلّ بوّابة، ومن
 * أراد السجلَّ فالرابط أسفلها.
 *
 * **و«لم تُطابَق بعد» ليست تطابقًا** كـ«بانتظار ملف التسوية» سواءً:
 * الوظيفةُ اليومية لا تُطابق بوّابةً بلا حركةٍ في يومها، فلا صفَّ لها —
 * وإسقاطُ الغياب في الأخضر أسوأ ما يقوله تقريرُ مطابقة.
 */
export function ReconciliationPanel({ recon }: { recon: ReconciliationSummary }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5 lg:w-100 lg:flex-none">
      <h2 className="mb-3 text-3xs font-bold tracking-[0.16em] opacity-65">المطابقة مع البوابات</h2>

      <dl>
        {recon.gateways.map((row) => (
          <div
            key={row.gatewayKey}
            className="flex items-baseline justify-between gap-3 py-2 text-2xs"
          >
            {/* **ومفتاح البوّابة لاتينيّ يُقارن خانةً بخانة** — فـ`dir="ltr"` */}
            <dt className="min-w-0 flex-1 truncate font-num opacity-65" dir="ltr">
              {row.gatewayKey}
            </dt>
            <dd
              className={
                row.status === 'DIFFERS'
                  ? 'font-bold text-warn-900'
                  : row.status === 'MATCHED'
                    ? 'font-bold text-accent-700'
                    : 'font-bold opacity-65'
              }
            >
              {row.status === null ? (
                RECON_NEVER_LABEL
              ) : row.status === 'DIFFERS' ? (
                <>
                  {RECON_STATUS_LABEL.DIFFERS} (<ArabicNumber value={row.mismatchCount} />)
                </>
              ) : (
                RECON_STATUS_LABEL[row.status]
              )}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 border-t border-line-2 pt-3 text-3xs leading-relaxed opacity-65">
        أي فرق يفتح بجدول المعاملات المختلفة وحدها — لا بالمجاميع، فمجموع يقول «ينقص
        أربع مئة» يجعلك تعرف أن ثمة خطأ ولا تعرف أين.
      </p>
    </section>
  );
}

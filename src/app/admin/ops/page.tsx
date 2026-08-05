import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { SectionHead } from '@/components/admin/SectionHead';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Quantity } from '@/components/ui/Quantity';
import { ShareBars } from '@/components/ui/ShareBars';
import { Sparkline } from '@/components/ui/Sparkline';
import { TargetBars } from '@/components/ui/TargetBar';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { stageMetrics } from '@/lib/domain/admin-orders';
import {
  auctionQuality,
  contentQuality,
  dailyOrders,
  stageTimes,
} from '@/lib/domain/admin-charts';
import { toArabicDigits } from '@/lib/arabic';
import { STAGE_LABEL, STAGE_TIME_LABEL, dayTick } from '@/lib/labels/charts';

export const dynamic = 'force-dynamic';

const RANGE_DAYS = 30;

/**
 * A2 — التشغيلية: الطوابير والأزمنة.
 *
 * **العدد وحده لا يقول شيئًا**: عشرون طلبًا في «الدفع» حالٌ طبيعية إن
 * دخلوها اليوم، وأزمةٌ إن مضى على أقدمهم أسبوع. فالمؤشّر زمنُ البقاء
 * مقابل الهدف، والعدد سياق له.
 *
 * ═══ والرسوم من القاعدة لا مزروعة ═══
 *
 * كل سلسلة هنا تُحسب لحظة فتح الصفحة. ورسمٌ بسلسلةٍ ثابتة يبدو حيًّا
 * وهو ميّت: يتحرّك في التصميم ولا يتحرّك في الإنتاج.
 */
export default async function OpsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const [metrics, times, daily, content, auctions] = await Promise.all([
    stageMetrics(),
    stageTimes(),
    dailyOrders(RANGE_DAYS),
    contentQuality(),
    auctionQuality(),
  ]);

  /**
   * المحور مشترك بين الصفوف كي تُقارن — وأقصاه أكبر هدفٍ أو أطول
   * وسيط، أيّهما أكبر. ومحورٌ بأقصى الأهداف وحدها يقصّ تجاوزًا فادحًا
   * فيبدو مساويًا للهدف.
   */
  const scaleMax = Math.max(
    ...times.map((row) => Math.max(row.targetHours, row.medianHours)),
    1,
  );

  const measured = times.filter((row) => row.samples > 0).length;

  return (
    <AdminShell title="التشغيلية"
      subtitle="الطوابير والأزمنة مقابل الأهداف" activeHref="/admin/ops" admin={admin}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => {
          const ratio = metric.targetHours === 0 ? 0 : metric.averageHours / metric.targetHours;
          const tone = ratio > 2 ? 'danger' : ratio > 1 ? 'warn' : 'accent';

          return (
            <section key={metric.stage} className="rounded-lg border border-line bg-surface p-5">
              <h2 className="mb-3 text-xs font-bold opacity-70">
                {STAGE_LABEL[metric.stage] ?? metric.stage}
              </h2>

              <p className="mb-1 text-3xl font-bold">
                <ArabicNumber value={metric.count} />
              </p>
              <p className="mb-3.5 text-3xs opacity-45">طلبًا في المرحلة</p>

              {/* المتوسّط مقابل الهدف — الشريط يتجاوز حدّه فيُقرأ التجاوز */}
              <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
                <div
                  className={
                    tone === 'danger'
                      ? 'h-full bg-danger'
                      : tone === 'warn'
                        ? 'h-full bg-warn'
                        : 'h-full bg-accent'
                  }
                  style={{ width: `${String(Math.min(100, ratio * 50))}%` }}
                />
              </div>

              <p className="flex flex-wrap items-center gap-1.5 text-3xs opacity-60">
                <span>متوسّط</span>
                <ArabicNumber value={metric.averageHours} />
                <span>ساعة · الهدف</span>
                <ArabicNumber value={metric.targetHours} />
              </p>

              {metric.critical === 0 ? null : (
                <Badge tone="danger" className="mt-3">
                  <span className="flex items-center gap-1.5">
                    <Quantity unit="exceeded" count={metric.critical} />
                    <span>الضعف</span>
                  </span>
                </Badge>
              )}
            </section>
          );
        })}
      </div>

      <SectionHead title="أزمنة المراحل" note="الوسيط بالساعات مقابل الهدف" />
      {/*
        **الوسيط لا المتوسّط**: صفقةٌ واحدة تعطّلت شهرًا تُفسد المتوسّط
        وحدها فيبدو النظام أبطأ ممّا هو.
      */}
      <TargetBars
        rows={times.map((row) => ({
          label: STAGE_TIME_LABEL[row.key] ?? row.key,
          displayValue: row.medianHours,
          target: row.targetHours,
          valueLabel:
            row.samples === 0 ? '—' : `${toArabicDigits(String(row.medianHours))}`,
        }))}
        scaleMax={scaleMax}
        scaleNote={`المحور بالساعات · حتى ${toArabicDigits(String(Math.round(scaleMax)))}`}
      />
      {measured === times.length ? null : (
        // **صفٌّ بلا عيّنة صفرٌ لا «سريع»** — ويُقال بدل أن يُقرأ إنجازًا
        <p className="mt-2.5 text-3xs opacity-50">
          مراحل ({toArabicDigits(String(times.length - measured))}) بلا عيّنة في آخر تسعين يومًا
          — تُعرض صفرًا لأنها لم تُقَس، لا لأنها فورية.
        </p>
      )}

      <SectionHead title="حجم الطلبات اليومي" note={`أيّام (${toArabicDigits(String(RANGE_DAYS))})`} />
      <Sparkline
        points={daily.map((point) => ({ label: dayTick(point.day), value: point.count }))}
      />

      <SectionHead title="جودة المحتوى والمزادات" note="من القاعدة المعلَنة تحت كل شريط" />
      <div className="grid gap-5 lg:grid-cols-2">
        <ShareBars
          shares={[
            { label: 'طُمست لوحاتها', value: content.blurred },
            { label: 'رُدّت لصاحبها بعد المراجعة', value: content.rejected, tone: 'warn' },
            { label: 'أُحيلت لتكرار صورة', value: content.duplicates, tone: 'danger' },
          ]}
          total={content.uploadedImages}
          baseNote={`القاعدة — الصور المرفوعة منذ الإطلاق (${toArabicDigits(String(content.uploadedImages))})`}
        />

        <div className="rounded-xl border border-line bg-surface px-5 py-4.5">
          <div className="flex flex-col divide-y divide-line">
            <Stat
              label="بلغت الاحتياطي"
              value={
                auctions.total === 0
                  ? '—'
                  : `${toArabicDigits(String(Math.round((auctions.metReserve / auctions.total) * 100)))}٪`
              }
            />
            <Stat label="وسيط المزايدات" value={toArabicDigits(String(auctions.medianBids))} />
            {/* الوحدة في التسمية لا بعد الرقم — والجملة لا يحكمها المعدود */}
            <Stat
              label="وسيط التمديد — بالمرّات"
              value={toArabicDigits(String(auctions.medianExtensions))}
            />
            <Stat
              label="عربونٌ صودر"
              value={toArabicDigits(String(auctions.withdrawnAfterWin))}
            />
          </div>
          <p className="mt-3 border-t border-line pt-3 text-3xs opacity-50">
            المزادات المنتهية منذ الإطلاق ({toArabicDigits(String(auctions.total))})
          </p>
        </div>
      </div>
    </AdminShell>
  );
}


function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-2xs opacity-72">{label}</span>
      <span className="font-num text-sm font-bold">{value}</span>
    </div>
  );
}

import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { stageMetrics } from '@/lib/domain/admin-orders';

export const dynamic = 'force-dynamic';

const STAGE_LABEL: Record<string, string> = {
  REQUEST: 'الطلب', APPROVED: 'الموافقة', INSPECTION: 'الفحص',
  PAYMENT: 'الدفع', TRANSFER: 'نقل الملكية',
};

/**
 * A2 — التشغيلية: مؤشّرات المراحل بخطّ هدف.
 *
 * **العدد وحده لا يقول شيئًا**: عشرون طلبًا في «الدفع» حالٌ طبيعية إن
 * دخلوها اليوم، وأزمةٌ إن مضى على أقدمهم أسبوع. فالمؤشّر متوسّط البقاء
 * مقابل الهدف، والعدد سياق له.
 */
export default async function OpsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const metrics = await stageMetrics();

  return (
    <AdminShell title="التشغيلية" activeHref="/admin/ops" admin={admin}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => {
          const ratio = metric.targetHours === 0 ? 0 : metric.averageHours / metric.targetHours;
          const tone = ratio > 2 ? 'danger' : ratio > 1 ? 'warn' : 'accent';

          return (
            <section
              key={metric.stage}
              className="rounded-lg border border-line bg-surface p-5"
            >
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
                    tone === 'danger' ? 'h-full bg-danger' : tone === 'warn' ? 'h-full bg-warn' : 'h-full bg-accent'
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
    </AdminShell>
  );
}

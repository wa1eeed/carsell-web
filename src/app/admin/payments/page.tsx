import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { getProcessingFee, listGateways, listRoutes } from '@/lib/domain/payment-routing';
import { listRuns } from '@/lib/domain/reconciliation';
import { ProcessingFeeCard } from './ProcessingFeeCard';
import { ReconciliationTable } from './ReconciliationTable';
import { RoutesTable } from './RoutesTable';

export const dynamic = 'force-dynamic';

/**
 * A20 — إعدادات الدفع والتوجيه.
 *
 * **لكل غرض بوابته**، والسوبر أدمن يبدّل بلا نشر. وأربع قواعد تحكم
 * التبديل، أهمّها: المعاملات الجارية تبقى على بوابتها، والحجز يُفرَج
 * **من حيث أُنشئ** — لا نقل أرصدة بين بوابتين أبدًا.
 */
export default async function PaymentsRoutingPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const [routes, gateways, processingFee, runs] = await Promise.all([
    listRoutes(),
    listGateways(),
    getProcessingFee(),
    listRuns(),
  ]);
  const linked = gateways.filter((gateway) => gateway.status !== 'INACTIVE');

  return (
    <AdminShell title="إعدادات الدفع والتوجيه" activeHref="/admin/payments" admin={admin}>
      <p className="mb-4 flex flex-wrap items-center gap-2 text-2xs opacity-55">
        <Quantity unit="paymentPurposes" count={routes.length} />
        <span aria-hidden className="opacity-40">·</span>
        <Quantity unit="gateways" count={linked.length} /> مربوطة
        <span aria-hidden className="opacity-40">·</span>
        <span>التبديل يحتاج موافقة عضوين</span>
      </p>

      <h2 className="mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-45">
        أغراض الدفع — لكلٍّ بوابته
      </h2>
      <RoutesTable
        routes={routes}
        canManage={canWrite(admin.role, 'finance.view')}
      />

      <h2 className="mt-6 mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-45">
        البوابات المربوطة
      </h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {gateways.map((gateway) => (
          <section key={gateway.key} className="rounded-lg border border-line bg-surface p-5">
            <div className="mb-3 flex items-baseline gap-2">
              <h3 className="flex-1 text-xs font-bold">{gateway.nameAr}</h3>
              <Badge tone={gateway.status === 'ACTIVE' ? 'accent' : 'neutral'}>
                {gateway.status === 'ACTIVE' ? 'مربوطة' : 'غير مفعّلة'}
              </Badge>
            </div>

            {/* القدرات معلَنة — والنطاق يقرأها ولا يفترض */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Capability on={gateway.capabilities.supportsHold} label="حجز" />
              <Capability on={gateway.capabilities.supportsPartialSettle} label="إفراج جزئي" />
              <Capability on={gateway.capabilities.supportsRefund} label="استرجاع" />
            </div>

            <div className="flex flex-col gap-1.5 border-t border-line pt-3 text-2xs">
              <Line label="أقصى مدّة حجز">
                <Quantity unit="days" count={gateway.capabilities.maxHoldDays} />
              </Line>
              <Line label="مدّة التسوية">
                {gateway.capabilities.settlementDelayHours === 0 ? (
                  <span>فوري</span>
                ) : (
                  <Quantity unit="hours" count={gateway.capabilities.settlementDelayHours} />
                )}
              </Line>
              <Line label="الرسوم">
                <span className="flex items-baseline gap-1">
                  <span className="font-num">
                    <ArabicNumber value={gateway.capabilities.feePct} decimals={2} grouped={false} />٪
                  </span>
                  <span aria-hidden className="opacity-40">+</span>
                  <Money amount={String(gateway.capabilities.feeFixed)} />
                </span>
              </Line>
            </div>
          </section>
        ))}
      </div>

      <ProcessingFeeCard
        initial={processingFee}
        canManage={canWrite(admin.role, 'finance.view')}
      />

      {/*
        ═══ المطابقة اليومية ═══

        ودفترُنا مرآة، والمرآة التي لا تُقارَن بالأصل ليست مرآة. وموضعها
        هنا لأن المُقارَن به تسويةُ البوابة.
      */}
      <h2 className="mt-6 mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-45">
        المطابقة اليومية مع تسوية البوابات
      </h2>
      {runs.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-5 text-2xs leading-loose opacity-60">
          لم تُشغَّل المطابقة بعد. وهي تقرأ تسوية كل بوابة وتقارنها بدفترنا، وتكتب
          <strong> جدول المعاملات المختلفة</strong> لا المجاميع — فالفرق حدثٌ يُعالَج لا
          رقمٌ يُتأمَّل.
        </p>
      ) : (
        <ReconciliationTable runs={runs} />
      )}

      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-45">
          ما يحدث عند التبديل
        </h2>
        <ul className="flex flex-col gap-2.5 text-sm leading-loose opacity-72">
          <li>
            <strong>المعاملات الجارية تبقى على بوابتها.</strong> الحجز القائم يُفرَج عنه من
            حيث أُنشئ — <strong>لا نقل أرصدة بين بوابتين</strong>. ولهذا يُخزَّن مفتاح
            البوابة في كل معاملة ويُقرأ منها لا من الإعداد.
          </li>
          <li>التبديل يسري على المعاملات الجديدة وحدها، ابتداءً من لحظة التنفيذ.</li>
          <li>لا يمكن تعطيل غرض له معاملات جارية — يُوقف الجديد ويبقى القائم حتى ينتهي.</li>
          <li>التبديل يحتاج موافقة عضوين ويُسجَّل باسميهما وبالبوابتين في سجل التدقيق.</li>
          <li>
            <strong>البوابة التي تنقصها قدرة مطلوبة لا تظهر في القائمة أصلًا</strong> — لا
            تُعرض ثم تُرفض. أمّا قِصَر مدّة الحجز فتحذيرٌ يشرح الأثر ولا يمنع.
          </li>
        </ul>
      </section>
    </AdminShell>
  );
}

function Capability({ on, label }: { on: boolean; label: string }) {
  return on ? (
    <Badge tone="neutral">{label}</Badge>
  ) : (
    <span className="rounded-sm border border-line px-2 py-0.5 text-3xs opacity-35 line-through">
      {label}
    </span>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="flex items-baseline justify-between gap-3">
      <span className="opacity-60">{label}</span>
      {children}
    </p>
  );
}

import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import {
  getProcessingFee,
  listGateways,
  listRoutes,
  pendingSwitches,
  routeChanges,
} from '@/lib/domain/payment-routing';
import { listRuns } from '@/lib/domain/reconciliation';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { PAYMENT_PURPOSE_LABEL } from '@/lib/labels/admin';
import type { PaymentPurpose } from '@/generated/prisma/enums';
import { getProviderFeePlan } from '@/lib/domain/provider-fees';
import { GatewayFeesForm } from './GatewayFeesForm';
import { ProcessingFeeCard } from './ProcessingFeeCard';
import { ProviderFeesCard } from './ProviderFeesCard';
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

  const [routes, awaiting, gateways, processingFee, providerFees, runs, changes] =
    await Promise.all([
      listRoutes(),
      pendingSwitches(),
      listGateways(),
      getProcessingFee(),
      getProviderFeePlan(),
      listRuns(),
      routeChanges(),
    ]);
  const linked = gateways.filter((gateway) => gateway.status !== 'INACTIVE');
  /**
   * **ومربوطةٌ ليست مُهيَّأة.** `status: ACTIVE` صفٌّ في القاعدة، والمُهايئ
   * شيفرة. وأربعُ بوّابات كلُّها `ACTIVE` ومُهايئان — فكانت الشاشة تقول
   * «٤ بوابات مربوطة» وتضع «بيع المركبات — الضمان» على المصرفية وتقول
   * «٢٥٤٬٥٧٠ ريال محجوز الآن»، وهي لا تستطيع تحصيل ريال.
   */
  const servable = gateways.filter((gateway) => gateway.implemented);
  const blockedPurposes = routes.filter((route) => !route.gatewayImplemented && route.enabled);

  return (
    <AdminShell title="إعدادات الدفع والتوجيه" activeHref="/admin/payments" admin={admin}>
      <p className="mb-4 flex flex-wrap items-center gap-2 text-2xs opacity-70">
        <Quantity unit="paymentPurposes" count={routes.length} />
        <span aria-hidden className="opacity-40">·</span>
        {/*
          **والاتّفاق داخل صيغة الجمع لا بعدها**: «بوابتان مربوطة» خطأ،
          وصوابُها «مربوطتان» — والعربية ستُّ حالات، فالوصف يُكتب في كلٍّ.
        */}
        <Quantity unit="linkedGateways" count={linked.length} />
        <span aria-hidden className="opacity-40">·</span>
        <Quantity unit="servableGateways" count={servable.length} />
        <span aria-hidden className="opacity-40">·</span>
        <span>التبديل يحتاج موافقة عضوين</span>
      </p>

      {/*
        **والإنذار قبل أن يدفع أحد لا بعده.** غرضٌ مفعَّلٌ على بوابةٍ بلا
        مُهايئ يردّ كلَّ دفعٍ بـ`GATEWAY_NOT_CONFIGURED` — ويكتشفه المشتري
        عند الضغط على «ادفع»، والمشغّل لا يعرف السبب.
      */}
      {blockedPurposes.length === 0 ? null : (
        <section className="mb-5 rounded-lg border border-warn/35 bg-warn-100 p-4.5">
          <p className="mb-1.5 text-xs font-bold">أغراضٌ لا يُقبل فيها دفعٌ الآن</p>
          <p className="mb-2.5 text-2xs leading-loose opacity-75">
            بوابتها مربوطةٌ في القاعدة ولا وصلةَ لها في المنتج بعد — فكلُّ محاولة دفع
            تُردّ. وجّهها إلى بوابةٍ تُحصّل، أو عطّل الغرض حتى تصل الوصلة.
          </p>
          <ul className="flex flex-col gap-1 text-2xs">
            {blockedPurposes.map((route) => (
              <li key={route.purpose}>
                <span className="font-bold">{PAYMENT_PURPOSE_LABEL[route.purpose]}</span>
                <span className="opacity-70"> — {route.gatewayNameAr ?? route.gatewayKey}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">
        أغراض الدفع — لكلٍّ بوابته
      </h2>
      <RoutesTable
        routes={routes}
        awaiting={awaiting}
        adminId={admin.id}
        canManage={canWrite(admin.role, 'finance.view')}
      />

      <h2 className="mt-6 mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">
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
              {/* القدرات تصف ما تستطيعه البوابة، لا أنّ لنا طريقًا إليها */}
              {gateway.implemented ? null : <Badge tone="warn">بلا وصلة</Badge>}
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
              {/*
                **والرسومُ تُعدَّل من هنا** — قرار المالك: «الرسوم تُضبط
                من لوحة الأدمن ولا نضعها داخل الكود». وكانت تأتي من
                البذرة وثابتٍ في المُهايئ، فتعديلُ عقدٍ يحتاج نشرًا.
              */}
              <Line label="الرسوم">
                <GatewayFeesForm
                  gatewayKey={gateway.key}
                  feePct={gateway.capabilities.feePct}
                  feeFixed={gateway.capabilities.feeFixed}
                  canManage={canWrite(admin.role, 'finance.view')}
                />
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
        ═══ ورسومُ بوّابة المزوّدين ثالثةٌ لا تُشتقّ من الاثنتين ═══

        بطاقاتُ البوّابات تقول **ما تأخذه البوّابة منّا**، ورسومُ
        المعالجة **ما نأخذه نحن من طرفَي البيع**، وهذه **ما يُخصم من
        شريكٍ مزوّدِ خدمة** لدى بوّابةٍ أخرى. وثلاثتُها أرقامٌ مختلفة،
        واشتقاقُ إحداها من الأخرى يجعل تغيير عقدٍ يغيّر شروط شريك.
      */}
      <ProviderFeesCard
        initial={providerFees}
        canManage={canWrite(admin.role, 'finance.view')}
      />

      {/*
        ═══ المطابقة اليومية ═══

        ودفترُنا مرآة، والمرآة التي لا تُقارَن بالأصل ليست مرآة. وموضعها
        هنا لأن المُقارَن به تسويةُ البوابة.
      */}
      <h2 className="mt-6 mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">
        المطابقة اليومية مع تسوية البوابات
      </h2>
      {runs.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-5 text-2xs leading-loose opacity-70">
          لم تُشغَّل المطابقة بعد. وهي تقرأ تسوية كل بوابة وتقارنها بدفترنا، وتكتب
          <strong> جدول المعاملات المختلفة</strong> لا المجاميع — فالفرق حدثٌ يُعالَج لا
          رقمٌ يُتأمَّل.
        </p>
      ) : (
        <ReconciliationTable runs={runs} />
      )}

      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">
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
      {/*
        ═══ ولماذا تحوّلنا ═══

        سجلُّ التدقيق يحفظ الفعل (`route.switched`) لا القصّة. ومن
        يسأل بعد سنة «لماذا تركنا ميسر في مارس؟» يحتاج السبب
        والمُوافِقين — و`PaymentRouteChange` بُني لذلك ولم يكن له
        كاتبٌ ولا قارئ.
      */}
      <section className="mt-10">
        <h2 className="mb-1 text-sm font-bold">تاريخ التبديل</h2>
        <p className="mb-3.5 text-3xs opacity-70">
          كلُّ تبديلٍ بسببه ومن اعتمده — والقرار بلا سببه يُعاد نقضه.
        </p>

        {changes.length === 0 ? (
          <p className="rounded-lg border border-line border-dashed p-5 text-2xs opacity-70">
            لم يُبدَّل مسارٌ بعد. وأوّل تبديل يُسجَّل هنا بسببه ومن اعتمده.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {changes.map((change) => (
              <li
                key={`${change.purpose}-${change.at}`}
                className="rounded-lg border border-line bg-surface p-4"
              >
                <p className="mb-1 flex flex-wrap items-center gap-2 text-2xs font-bold">
                  <span>{PAYMENT_PURPOSE_LABEL[change.purpose as PaymentPurpose] ?? change.purpose}</span>
                  <span className="font-normal opacity-70">
                    {change.fromGatewayKey ?? '—'} ← {change.toGatewayKey}
                  </span>
                  <Badge size="sm" tone="neutral">
                    <Quantity unit="approvals" count={change.approvals} />
                  </Badge>
                </p>
                <p className="text-3xs leading-relaxed opacity-75">{change.reason}</p>
                <p className="font-num mt-1 text-3xs opacity-65">
                  {changeDate.format(new Date(change.at))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}

const changeDate = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

function Capability({ on, label }: { on: boolean; label: string }) {
  return on ? (
    <Badge tone="neutral">{label}</Badge>
  ) : (
    <span className="rounded-sm border border-line px-2 py-0.5 text-3xs opacity-65 line-through">
      {label}
    </span>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="flex items-baseline justify-between gap-3">
      <span className="opacity-70">{label}</span>
      {children}
    </p>
  );
}

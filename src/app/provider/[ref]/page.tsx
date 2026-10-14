import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { providerRequestView } from '@/lib/domain/provider-queue';
import { PROVIDER_REQUEST_STATUS } from '@/lib/labels/provider';
import { ProviderBar } from '../ProviderBar';
import { StepActions } from './StepActions';

export const dynamic = 'force-dynamic';

/**
 * ═══ صفحةُ الطلب — كرتٌ ثابت وقسمٌ متغيّر ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٤): «كرت معلومات الطلب فيه رقم الطلب وتاريخ
 * ووقت الطلب وحالة الطلب ومعلومات طالب الخدمة، ثمّ قسمٌ أسفله **متغيّر
 * حسب نوعية الطلب** وفيه أزرار الأكشن».
 *
 * فالصدفةُ واحدة لكل الأصناف، والاختلاف في `stepsFor` وحدها — وشاشتان
 * متوأمتان تتباعدان أوّل تعديل في إحداهما.
 */
export default async function ProviderRequestPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const user = await currentProviderUser();
  if (user === null) redirect('/provider/login');

  const { ref } = await params;
  /** **والمرجع يصل مُرمَّزًا من Next** — فيُفكّ حيث يُقارَن. */
  const view = await providerRequestView(decodeURIComponent(ref), user.providerId);
  /** ومن لا شأن له به يرى ٤٠٤ لا ٤٠٣: وجودُ الطلب نفسه معلومة */
  if (view === null) notFound();

  const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Riyadh',
  });

  return (
    <>
      <ProviderBar name={user.name} />

      <main className="mx-auto w-full max-w-3xl p-6">
        <Link href="/provider" className="mb-6 inline-block text-2xs opacity-55 hover:opacity-100">
          → كل الطلبات
        </Link>

        {/* ═══ الثابت: كرت معلومات الطلب ═══ */}
        <section className="mb-7 rounded-xl border border-line">
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-5">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{view.serviceName}</span>
              <span dir="ltr" className="font-num mt-1 block text-2xs opacity-55">
                {view.ref}
              </span>
            </span>
            {!view.overdue ? null : <Badge tone="danger">تجاوز المهلة</Badge>}
            <Badge tone={view.status === 'NEW' ? 'accent' : 'neutral'}>
              {PROVIDER_REQUEST_STATUS[view.status] ?? view.status}
            </Badge>
          </div>

          <dl className="flex flex-col">
            <Row label="المركبة" value={<span className="bidi-isolate">{view.vehicleTitle}</span>} />
            {view.city === null ? null : <Row label="المدينة" value={view.city} />}
            <Row label="تاريخ الطلب" value={<span className="bidi-isolate">{date.format(new Date(view.createdAt))}</span>} />
            {view.scheduledAt === null ? null : (
              <Row
                label="الموعد الذي اختاره العميل"
                value={<span className="bidi-isolate">{date.format(new Date(view.scheduledAt))}</span>}
              />
            )}
            {view.dueAt === null ? null : (
              <Row
                label="مهلتك"
                value={<span className="bidi-isolate">{date.format(new Date(view.dueAt))}</span>}
              />
            )}

            {/*
              ═══ ومعلومات طالب الخدمة ═══

              **وطالبُ الخدمة ليس دائمًا صاحب المركبة**: مشترٍ يفحص
              سيارة غيره. فيُعرض الطرفان ولكلٍّ صفتُه — وإلّا اتّصل
              الفاحص بمن لا يملك فتح الباب.
            */}
            <Row
              label="طالب الخدمة"
              value={
                <span className="flex flex-wrap items-baseline gap-2.5">
                  <span className="bidi-isolate">{view.requester.name ?? '—'}</span>
                  <span dir="ltr" className="font-num text-2xs opacity-70">
                    {view.requester.phone}
                  </span>
                </span>
              }
            />
            {view.keeper === null ? null : (
              <Row
                label="المركبة عند"
                value={
                  <span className="flex flex-wrap items-baseline gap-2.5">
                    <span className="bidi-isolate">{view.keeper.name ?? '—'}</span>
                    <span dir="ltr" className="font-num text-2xs opacity-70">
                      {view.keeper.phone}
                    </span>
                  </span>
                }
              />
            )}
          </dl>
        </section>

        {/* ═══ المتغيّر: أزرار المعالجة بحسب الصنف والحال ═══ */}
        <StepActions ref_={view.ref} steps={view.steps} />
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3.5 last:border-b-0">
      <dt className="shrink-0 text-2xs opacity-55">{label}</dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}

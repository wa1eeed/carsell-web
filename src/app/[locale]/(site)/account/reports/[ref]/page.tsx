import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { currentUserFromCookies } from '@/lib/domain/account';
import { serviceRequestView } from '@/lib/domain/service-lifecycle';
import { SERVICE_REQUEST_STATUS } from '@/lib/labels/services';
import { ServiceRequestPanel } from './ServiceRequestPanel';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  /** طلبٌ خاصٌّ بطرفيه — لا يُفهرَس */
  return { title: ref, robots: { index: false, follow: false } };
}

/**
 * ═══ صفحةُ طلب الخدمة — بوجهين ═══
 *
 * **ولم يكن لها وجود.** `/account/reports` تعرض الطلبات بلا رابط
 * (`href={null}`) وتقول عن كلٍّ «بانتظار التقرير» أيًّا كان حالُه —
 * فمن رُفض طلبُه يقرأ أنه ينتظر تقريرًا لن يأتي.
 *
 * والدورة ثلاثية الأطراف تحتاج هذه الشاشة: البائع يأذن منها، والطالب
 * يسدّد منها. وبلا بابٍ تبقى القاعدة حبرًا.
 */
export default async function ServiceRequestPage({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}) {
  const { locale, ref } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  /** **والمرجع يصل مُرمَّزًا من Next** — فيُفكّ حيث يُقارَن. */
  const view = await serviceRequestView(decodeURIComponent(ref), user.id);
  /** غيرُ طرفيه يرى ٤٠٤ لا ٤٠٣: وجودُ الطلب نفسه معلومة */
  if (view === null) notFound();

  const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Riyadh',
  });

  const label = SERVICE_REQUEST_STATUS[view.status] ?? view.status;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-3xl px-10 py-10">
          <Breadcrumb
            label="مسار التنقّل"
            separator="›"
            className="mb-6"
            items={[
              { label: 'حسابي', href: `/${locale}/account` },
              { label: 'تقاريري', href: `/${locale}/account/reports` },
              { label: view.ref },
            ]}
          />

          <h1 className="font-num mb-1.5 text-3xl font-bold tracking-tight">{view.ref}</h1>
          <p className="mb-6 flex flex-wrap items-center gap-2.5 text-sm">
            <span className="opacity-60">{view.serviceName}</span>
            <span aria-hidden className="opacity-40">
              ·
            </span>
            <span className="bidi-isolate font-bold">{view.vehicleTitle}</span>
          </p>

          <p className="mb-7 flex flex-wrap items-center gap-2.5">
            <Badge
              tone={
                view.status === 'DECLINED'
                  ? 'danger'
                  : view.awaitingYou
                    ? 'warn'
                    : view.paid
                      ? 'accent'
                      : 'neutral'
              }
            >
              {label}
            </Badge>
            {view.city === null ? null : <span className="text-2xs opacity-55">{view.city}</span>}
          </p>

          {/*
            ═══ وما يُنتظر منك يتصدّر ═══

            لوحةُ الفعل قبل التفاصيل: من يفتح الصفحة ليقرّر لا يبحث عن
            زرّه أسفل جدول.
          */}
          <div className="mb-7">
            <ServiceRequestPanel
              ref_={view.ref}
              role={view.role}
              status={view.status}
              total={view.total}
              locale={locale}
            />
          </div>

          {/*
            **والرفض يُقال بسببه.** «رُفض» وحدها تُعيد الطالب إلى
            الحيرة: أيعيد الطلب أم يبحث عن سيارةٍ أخرى؟
          */}
          {view.status !== 'DECLINED' ? null : (
            <section className="mb-7 rounded-xl bg-warn-100 p-5 text-warn-900">
              <h2 className="mb-1.5 text-sm font-bold">لم يُؤذَن بالفحص</h2>
              <p className="text-2xs leading-loose">
                {view.declineReason === 'consent.lapsed'
                  ? 'انقضت مهلة صاحب المركبة دون ردّ، فسقط الطلب. ولم يُؤخذ منك شيء.'
                  : (view.declineReason ?? 'لم يُذكر سبب.')}
              </p>
            </section>
          )}

          <section className="rounded-xl border border-line">
            <Row label="قيمة الخدمة" value={<ArabicNumber value={Number(view.total)} decimals={2} />} />
            {Number(view.platformFee) === 0 ? null : (
              <Row
                label="منها رسوم المنصّة"
                value={<ArabicNumber value={Number(view.platformFee)} decimals={2} />}
              />
            )}
            {/*
              **ومتى يُطلب السداد يُقال من اللحظة الأولى** — قرار المالك.
              فلا يُفاجأ الطالب بمطالبة، ولا ينتظر مطالبةً لن تأتي.
            */}
            <Row
              label="السداد"
              value={
                <span className="text-2xs opacity-70">
                  {view.paid
                    ? 'حُجز المبلغ'
                    : view.status === 'AWAITING_SELLER'
                      ? 'يُطلب بعد إذن صاحب المركبة'
                      : view.status === 'AWAITING_PAYMENT'
                        ? 'مطلوب الآن'
                        : 'لم يُطلب'}
                </span>
              }
            />
            <Row label="طُلبت" value={<span className="bidi-isolate">{date.format(new Date(view.createdAt))}</span>} />
            {view.scheduledAt === null ? null : (
              <Row
                label="الموعد الذي اخترته"
                value={<span className="bidi-isolate">{date.format(new Date(view.scheduledAt))}</span>}
              />
            )}
            {view.decisionDueAt === null || view.status !== 'AWAITING_SELLER' ? null : (
              <Row
                label="مهلة الإذن"
                value={<span className="bidi-isolate">{date.format(new Date(view.decisionDueAt))}</span>}
              />
            )}
          </section>
        </div>
      </main>
    </>
  );
}

/** سطرُ حقل — والخطّ يفصل لا الظلّ. */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3.5 last:border-b-0">
      <dt className="shrink-0 text-2xs opacity-55">{label}</dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}

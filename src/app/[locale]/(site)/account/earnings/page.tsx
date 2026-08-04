import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies } from '@/lib/domain/account';
import { sellerBook } from '@/lib/domain/seller-book';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: 'مستحقّاتي', robots: { index: false, follow: false } };
}

const BLOCKED_LABEL: Record<string, string> = {
  NOT_TRANSFERRED: 'بانتظار نقل الملكية',
  DISPUTED: 'نزاع مفتوح',
};

/**
 * ═══ الملفّ المالي للبائع ═══
 *
 * **دفترٌ لا محفظة.** لا رصيد يُسحب منه — بيانُ حقوق: ما لك، وممّ
 * خُصم، ومتى يصلك. والمال لدى مزوّد الدفع المرخَّص لا لدينا.
 *
 * والثلاثة في الأعلى لأنها الأسئلة الثلاثة التي يفتح البائع الصفحة
 * لأجلها: **كم محتجز · كم جاهز · كم وصلني**.
 */
export default async function EarningsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const book = await sellerBook(user.id, locale);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-4xl px-10 py-10">
          <Link
            href={`/${locale}/account`}
            className="mb-6 inline-block text-2xs opacity-55 hover:opacity-100"
          >
            ← حسابي
          </Link>

          <h1 className="mb-1.5 text-3xl font-bold tracking-tight">مستحقّاتي</h1>
          <p className="mb-8 text-sm leading-loose opacity-60">
            بيانُ حقوقك من كل صفقة. والمبلغ محفوظ لدى مزوّد الدفع حتى تنتقل
            الملكية وتنقضي نافذة الإرجاع، ثم يُحوَّل إلى آيبانك.
          </p>

          <div className="mb-8 grid gap-3 sm:grid-cols-3">
            <Card label="محتجز" note="لم يُستحقّ بعد" amount={book.held} />
            <Card label="جاهز للصرف" note="حقّك القائم" amount={book.payable} strong />
            <Card label="حُوِّل إليك" note="وصل آيبانك" amount={book.paidOut} />
          </div>

          <section className="mb-8 rounded-lg border border-line bg-surface p-5">
            <h2 className="mb-3.5 text-sm font-bold">الإجمالي</h2>
            <dl className="flex flex-col gap-2.5 text-2xs">
              <Row label="إجمالي المبيعات" value={book.totals.sales} />
              <Row label="عمولة المنصة" value={book.totals.commission} negative />
              <Row label="رسوم بوابة الدفع" value={book.totals.gatewayFees} negative />
              {/*
                **ضريبة العمولة ورسم النقل لا يُعرضان خصمًا.**
                دفعهما المشتري في إجماليه، وعرضُهما بالسالب يقول
                للبائع إنه دُفع عنه ما لم يُدفع — والفرق ٦٥٠ ريالًا
                في صفقةٍ واحدة. والنصّ المعروض وعدٌ لا وصف.
              */}
              <div className="mt-1.5 border-t border-line pt-3">
                <Row label="صافي ما استُحقّ لك" value={book.totals.earned} strong />
              </div>
            </dl>
          </section>

          <h2 className="mb-3.5 text-sm font-bold">صفقاتك</h2>
          {book.lines.length === 0 ? (
            <EmptyState
              title="لا صفقات بعد"
              description="حين تبيع مركبة يظهر هنا تفصيل مستحقّك منها."
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {book.lines.map((line) => (
                <article key={line.orderRef} className="rounded-lg border border-line bg-surface p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <p className="flex flex-wrap items-baseline gap-2 text-sm font-bold">
                      {line.title}
                      {/* المرجع يُنسخ ويُقارن — لاتينيّ معزول */}
                      <span dir="ltr" className="font-num text-2xs opacity-45">
                        {line.orderRef}
                      </span>
                    </p>
                    {line.blockedBy === null ? (
                      <Badge tone="accent">جاهز للصرف</Badge>
                    ) : (
                      <Badge tone="warn">{BLOCKED_LABEL[line.blockedBy] ?? line.blockedBy}</Badge>
                    )}
                  </div>

                  <dl className="flex flex-col gap-1.5 text-2xs">
                    <Row label="قيمة البيع" value={line.gross} />
                    <Row label="عمولة المنصة" value={line.commission} negative />
                    <Row label="رسوم البوابة" value={line.gatewayFee} negative />
                    <div className="mt-1 border-t border-line pt-2">
                      <Row label="صافي مستحقّك" value={line.net} strong />
                    </div>
                  </dl>

                  {line.releasesAt === null || line.blockedBy === null ? null : (
                    <p className="mt-2.5 text-3xs opacity-50">
                      يُفرَج عنه بعد {line.releasesAt}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Card({
  label,
  note,
  amount,
  strong,
}: {
  label: string;
  note: string;
  amount: string;
  strong?: boolean;
}) {
  return (
    <section
      className={
        strong === true
          ? 'rounded-lg border-2 border-ink p-4'
          : 'rounded-lg border border-line bg-surface p-4'
      }
    >
      <p className="text-2xs opacity-55">{label}</p>
      <p className="mt-1.5">
        <Money amount={Number(amount)} size="lg" />
      </p>
      <p className="mt-1 text-3xs opacity-45">{note}</p>
    </section>
  );
}

/** السالب يُرسم بإشارته يسارًا — و`ArabicNumber` تتولّى العزل. */
function Row({
  label,
  value,
  negative,
  strong,
}: {
  label: string;
  value: string;
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong === true ? 'font-bold' : ''}`}>
      <dt className={strong === true ? '' : 'opacity-60'}>{label}</dt>
      <dd className="font-num">
        <ArabicNumber value={negative === true ? -Number(value) : Number(value)} decimals={2} />
      </dd>
    </div>
  );
}

import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies } from '@/lib/domain/account';
import { walletView } from '@/lib/domain/wallet';
import { db } from '@/lib/db';
import { AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  // صفحةٌ خاصّة بصاحبها — لا تُفهرَس
  return { title: 'المحفظة', robots: { index: false, follow: false } };
}

/**
 * Wv — المحفظة.
 *
 * **والنطاق كان مبنيًّا ولا شاشة له**: `walletView` تحسب الكشف برصيدٍ
 * متراكم منذ بُنيت، و«حسابي» تعرض الرصيد رقمًا وحده بلا بابٍ يُقرأ
 * منه. فمن يرى «رصيدك ٨٬٥٠٠» لا يعرف ممّ تكوّن.
 *
 * ═══ والمحجوز عمودٌ مستقلّ ═══
 *
 * التصميم يفرّق ثلاثة: المتاح، والمحجوز كعربون، ومجموعَهما. ورصيدٌ
 * يُعرض كاملًا وبعضُه محجوز يجعل صاحبه يخطّط لما لا يملك التصرّف فيه.
 */
export default async function WalletPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const [view, holds] = await Promise.all([
    walletView(user.id),
    /**
     * العرابين المحجوزة — **ولكلٍّ مزادُه**. ومبلغٌ محجوز بلا ما يقول
     * أين يجعل صاحبه يظنّه مفقودًا.
     */
    db.deposit.findMany({
      where: { userId: user.id, status: 'HELD' },
      select: {
        amount: true,
        auction: {
          select: {
            endsAt: true,
            listing: {
              select: { ref: true, vehicle: { select: { brandName: true, modelName: true } } },
            },
          },
        },
      },
    }),
  ]);

  const heldTotal = holds.reduce((sum, row) => sum + Number(row.amount), 0);
  const available = Number(view.balance);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          {/*
            **وكان `<p>` لا `<nav>`** — فقارئ الشاشة يقرؤه فقرةً، ولا
            يبلغه بين مِلاحات الصفحة ولا يعلم أن «المحفظة» هي موضعُه.
          */}
          <Breadcrumb
            label="مسار التنقّل"
            separator="›"
            className="mb-5"
            items={[{ label: 'حسابي', href: `/${locale}/account` }, { label: 'المحفظة' }]}
          />

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <section className="rounded-xl border-2 border-ink p-5">
              <p className="mb-1.5 text-2xs opacity-70">الرصيد المتاح</p>
              <Money amount={available} size="xl" />
              <p className="mt-3 text-3xs leading-loose opacity-70">
                {/*
                  **ولا يُعرض زرّ شحنٍ لا يعمل.** شحن المحفظة غرضُ دفعٍ
                  موجَّه (`WALLET_TOPUP`) ولا شاشة تناديه بعد — وزرٌّ
                  يردّ خطأً بعد الضغط أسوأ من غيابه.
                */}
                الشحن والسحب يصلان مع ربط المحفظة بالبوابة.
              </p>
            </section>

            <section className="rounded-xl border border-line bg-surface p-5">
              <p className="mb-1.5 text-2xs opacity-70">محجوز كعربون</p>
              <Money amount={heldTotal} size="lg" />
              {holds.length === 0 ? (
                <p className="mt-3 text-3xs opacity-70">لا عرابين محجوزة.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {holds.map((row) => (
                    <li key={row.auction.listing.ref} className="text-3xs leading-loose opacity-75">
                      مزاد {row.auction.listing.vehicle.brandName}{' '}
                      {row.auction.listing.vehicle.modelName} — يُرَدّ عند الإغلاق إن لم تفز.
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-line bg-surface p-5">
              <p className="mb-1.5 text-2xs opacity-70">الإجمالي في المحفظة</p>
              <Money amount={available + heldTotal} size="lg" />
              {/*
                **ولا وحدة عربية بجوار رقم.** العربية ستّ حالات جمع،
                والمكتوبة بيدٍ تخطئ في أكثرها — فتُصاغ الجملة فلا يحكمها
                المعدود: «المتاح (٨٬٥٠٠)» لا «٨٬٥٠٠ متاح».
              */}
              <p className="mt-3 flex flex-wrap items-center gap-1.5 text-3xs opacity-70">
                <span className="flex items-center gap-1">
                  المتاح (<ArabicNumber value={available} />)
                </span>
                <span aria-hidden>+</span>
                <span className="flex items-center gap-1">
                  المحجوز (<ArabicNumber value={heldTotal} />)
                </span>
              </p>
            </section>
          </div>

          <h2 className="mb-1.5 text-base font-bold">دفتر الحركات</h2>
          <p className="mb-4 text-3xs leading-loose opacity-70">
            مضافٌ فقط، لا يُعدَّل. والرصيد محسوبٌ من الحركات لا مخزَّنًا رقمًا — والتصحيح
            يقع بقيدٍ عكسيّ لا بتعديل حركة، فيُقرأ الدفتر سجلًّا لا يُنقَض.
          </p>

          {view.lines.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface p-5 text-2xs opacity-70">
              لا حركة على محفظتك بعد.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[32rem] text-start text-2xs">
                <thead className="border-b border-line bg-surface text-3xs opacity-70">
                  <tr>
                    <th className="p-3 text-start font-bold">الحركة</th>
                    <th className="p-3 text-start font-bold">مرتبطة بـ</th>
                    <th className="p-3 text-start font-bold">التاريخ</th>
                    <th className="p-3 text-end font-bold">المبلغ</th>
                    <th className="p-3 text-end font-bold">الرصيد بعدها</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-2">
                  {view.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="p-3">{line.note ?? line.kind}</td>
                      <td className="p-3">
                        {line.orderRef === null ? (
                          <span className="opacity-65">—</span>
                        ) : (
                          <span dir="ltr" className="font-num text-3xs opacity-75">
                            {line.orderRef}
                          </span>
                        )}
                      </td>
                      <td className="bidi-isolate p-3 font-num text-3xs opacity-70">
                        {new Date(line.at).toLocaleDateString(AR_DATE_LOCALE)}
                      </td>
                      <td className="p-3 text-end">
                        {/* السالب يحتفظ بإشارته يسارًا — و`Money` تتكفّل */}
                        <Money amount={Number(line.amount)} showCurrency={false} size="sm" />
                      </td>
                      <td className="p-3 text-end">
                        <span className="font-num text-3xs opacity-75">
                          <ArabicNumber value={Number(line.runningBalance)} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-5 flex flex-wrap items-center gap-2 text-3xs opacity-70">
            <Badge tone="neutral">لا يُعدَّل</Badge>
            كل حركةٍ هنا قيدٌ في دفتر الحسابات، وتصحيحُها قيدٌ جديد يعاكسها.
          </p>
        </div>
      </main>
    </>
  );
}

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerBalance, dealerLedger } from '@/lib/domain/dealer-money';
import { listCommissionRules } from '@/lib/domain/admin-commission';
import { DealerShell } from '@/components/dealer/DealerShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { LEDGER_KIND_AR } from '@/lib/labels/dealer';
import { AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'التسويات والعمولة — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D8` — ما دخل وما خرج ═══
 *
 * **والعمولةُ المعروضة هي القاعدة السارية** (`listCommissionRules`)، لا
 * رقمٌ مكتوبٌ في الشاشة. والترميزُ يرسمها ثلاثًا — بيعٌ مباشر وتفاوضٌ
 * ومزاد — **وقاعدتُنا بُعدُها الطرفُ لا نوعُ الإعلان**: `CommissionSide`
 * بائعٌ ومشترٍ. فتُعرض كما هي، ولا تُخترع ثلاثةُ أرقامٍ من واحد: ثلاثةٌ
 * متساويةٌ تُقرأ قدرةً على التفريق لا نملكها، فيبني عليها المعرض تسعيره.
 *
 * **ولا زرَّ «غيّر الآيبان» هنا**: الآيبان على حساب صاحب المعرض
 * ويُحرَّر من ملفه، والترميزُ يشترط لتغييره **تحقّقًا من الأدمن
 * ووقفًا للتحويلات أربعًا وعشرين ساعة** — ولا شيء من ذلك مبنيّ. وزرٌّ
 * يَعِد بإجراءٍ أمنيّ لا يقع أسوأ من غيابه.
 */
export default async function DealerSettlements() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (actor.role === 'SALES') redirect('/dealer');

  const [balance, ledger, rules] = await Promise.all([
    dealerBalance(actor.dealerId, actor.branchId),
    dealerLedger(actor.dealerId, actor.branchId),
    listCommissionRules(),
  ]);

  const seller = rules.find((rule) => rule.side === 'SELLER');
  const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Riyadh',
  });

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/settlements"
      title="التسويات والعمولة"
      subtitle={
        balance.ibanMasked === null ? (
          /**
           * **والفراغُ يقول ما يترتّب عليه**: «لا آيبان» وحدها خبرٌ،
           * و«لا يُحوَّل إليك شيء» فعلٌ يُستدرك.
           */
          <span className="font-bold text-warn-900">
            لا آيبان مسجل — ولن يحول إليك شيء حتى يسجل في{' '}
            {/* **والإحالةُ رابطٌ لا وصف**: «يسجل في ملف صاحب المعرض» تترك
                قارئَها يبحث عن شاشةٍ لا يعرف أين هي. */}
            <Link href="/dealer/owner" className="underline">
              بيانات صاحب المعرض
            </Link>
            .
          </span>
        ) : (
          <span>
            آيبان ينتهي بـ <span dir="ltr" className="font-num">{balance.ibanMasked.slice(-4)}</span> · تحويل يومي
          </span>
        )
      }
      actions={
        <LinkButton href="/api/v1/dealer/orders/export" variant="outline" size="sm">
          كشف حساب
        </LinkButton>
      }
    >
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line p-5">
          <h2 className="mb-3 text-3xs font-bold tracking-wide opacity-70">الرصيد</h2>

          <div className="flex items-baseline justify-between gap-3 border-b border-line-2 py-2.5">
            <span className="text-2xs opacity-70">محتجز في الضمان</span>
            <span className="flex items-baseline gap-2.5">
              <span className="text-3xs opacity-70">
                <Quantity unit="liveOrders" count={balance.heldCount} />
              </span>
              <Money amount={balance.held} decimals={2} size="sm" />
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-3 border-b border-line-2 py-2.5">
            <span className="text-2xs opacity-70">جاهز للتحويل</span>
            <Money amount={balance.ready} decimals={2} size="sm" className="text-accent-700" />
          </div>

          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <span className="text-2xs opacity-70">حول هذا الشهر</span>
            <span className="flex items-baseline gap-2.5">
              <span className="text-3xs opacity-70">
                <Quantity unit="payouts" count={balance.payoutCount} />
              </span>
              <Money amount={balance.paidThisMonth} decimals={2} size="sm" />
            </span>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-3 text-3xs font-bold tracking-wide opacity-70">العمولة المطبقة عليك</h2>

          <div className="flex items-baseline justify-between gap-3 border-b border-line-2 py-2.5">
            <span className="text-2xs opacity-70">نسبة على البائع</span>
            <span className="text-sm font-bold">
              <ArabicNumber
                value={seller === undefined || !seller.enabled ? 0 : Number(seller.pct)}
                percent
              />
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <span className="text-2xs opacity-70">رسم ثابت</span>
            <Money
              amount={seller === undefined || !seller.enabled ? '0' : seller.fixedFee}
              decimals={2}
              size="sm"
            />
          </div>

          <p className="mt-3 rounded-lg border border-line p-4 text-2xs leading-loose opacity-75">
            تثبت لقطة في كل طلب وقت إنشائه، فتعديل القاعدة لا يغير طلبا قائما.
          </p>
        </section>
      </div>

      {ledger.length === 0 ? (
        <EmptyState
          title="لا حركة على مالك بعد"
          description="أول احتجاز ضمان يظهر هنا لحظة دفع المشتري، والتحويل بعد إتمام نقل الملكية."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-200 border-collapse text-start">
            <thead>
              <tr className="border-b border-line bg-surface text-3xs opacity-70">
                <th scope="col" className="px-5 py-3 text-start font-bold">التاريخ</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">النوع</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">البيان</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">المبلغ</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">العمولة</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">الضريبة</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">الصافي</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.orderRef} className="border-b border-line-2 last:border-b-0">
                  <td className="px-5 py-3.5 text-2xs opacity-75">{date.format(new Date(row.at))}</td>
                  <td className="px-5 py-3.5 text-2xs font-semibold">{LEDGER_KIND_AR[row.kind]}</td>
                  <td className="px-5 py-3.5 text-2xs">
                    <Link
                      href={`/dealer/orders/${row.orderRef}`}
                      className="font-semibold underline-offset-4 hover:underline"
                    >
                      {row.subject}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5"><Money amount={row.amount} decimals={2} size="sm" showCurrency={false} /></td>
                  <td className="px-5 py-3.5"><Money amount={row.commission} decimals={2} size="sm" showCurrency={false} /></td>
                  <td className="px-5 py-3.5">
                    {row.vat === null ? (
                      <span className="opacity-50">—</span>
                    ) : (
                      <Money amount={row.vat} decimals={2} size="sm" showCurrency={false} />
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {/*
                      **والمحتجزُ بلا صافٍ**: رقمٌ تحت «الصافي» يُقرأ
                      مالًا وصل، وهو ما زال لدى مزوّد الدفع.
                    */}
                    {row.net === null ? (
                      <span className="text-2xs font-bold text-warn-900">محتجز</span>
                    ) : (
                      <Money amount={row.net} decimals={2} size="sm" className="text-accent-700" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-5 rounded-xl border border-line bg-surface p-5 text-2xs leading-loose opacity-75">
        التحويل إلى آيبان المعرض فقط — لا آيبان شخصي ولا طرف ثالث. وتغييره اليوم يتم من ملف
        صاحب المعرض في حسابه.
      </p>
    </DealerShell>
  );
}

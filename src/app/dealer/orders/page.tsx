import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentDealer } from '@/lib/auth/dealer-session';
import {
  ORDER_BUCKETS,
  deskCounts,
  deskMoney,
  deskOrderBuckets,
  deskOrders,
  deskTransfers,
  type OrderBucket,
} from '@/lib/domain/dealer-desk';
import { DealerShell } from '@/components/dealer/DealerShell';
import { ORDER_BUCKET_AR } from '@/lib/labels/dealer';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { LinkButton } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { cn } from '@/lib/cn';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { OrdersTable } from './OrdersTable';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'الطلبات — المعرض', robots: { index: false, follow: false } };

function parseBucket(raw: string | undefined): OrderBucket {
  return ORDER_BUCKETS.find((bucket) => bucket === raw) ?? 'LIVE';
}

/**
 * ═══ `D6` — الطلبات: من الموافقة إلى الإفراج عن المبلغ ═══
 *
 * **والشاشةُ تقرأ ما بُني في كارز** — الطلبُ ومراحلُه وضمانُه — بعينِ
 * المعرض: على مركباته وفرعِه.
 *
 * **وبطاقةُ المال بحارسِ الإفراج نفسِه** (`canSettle`): بطاقةٌ تقول
 * «جاهز للتحويل» عن مالٍ يردّه الحارسُ وعدٌ مُخلَف، وهو أسوأ من
 * بطاقةٍ لا تقول شيئًا.
 */
export default async function DealerOrders({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');

  const bucket = parseBucket((await searchParams).bucket);

  const [rows, buckets, counts, money, transfers] = await Promise.all([
    deskOrders(actor.dealerId, actor.branchId, bucket),
    deskOrderBuckets(actor.dealerId, actor.branchId),
    deskCounts(actor.dealerId, actor.branchId),
    deskMoney(actor.dealerId, actor.branchId),
    deskTransfers(actor.dealerId, actor.branchId),
  ]);

  const when = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Riyadh',
  });

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/orders"
      title="الطلبات"
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Quantity unit="liveOrders" count={counts.ordersLive} />
          <span aria-hidden className="opacity-65">·</span>
          <Quantity unit="doneThisMonth" count={counts.ordersDoneThisMonth} />
        </span>
      }
      actions={
        <>
          <LinkButton href="/api/v1/dealer/orders/export" variant="outline" size="sm">
            تصدير
          </LinkButton>
          {/*
            **وزرُّ الترميز يبلغ هدفًا في الشاشة نفسِها**: بطاقةُ
            المواعيد تحت الجدول، فالمرساةُ تنزل إليها. وزرٌّ لا يصل
            شيئًا هو الصنف الذي أُصلح هنا مرارًا.
          */}
          <LinkButton href="#transfers" size="sm">
            مواعيد النقل
          </LinkButton>
        </>
      }
    >
      {/*
        **والشريحةُ تحمل عدّادَ ما تفتحه**: مِصفاةٌ واحدة يقرؤها العدُّ
        والجلب في `dealer-desk.ts` — فلا تقول سبعًا وتفتح على خمس.
      */}
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="شرائح الطلبات">
        {ORDER_BUCKETS.map((item) => (
          <Link
            key={item}
            href={item === 'LIVE' ? '/dealer/orders' : `/dealer/orders?bucket=${item}`}
            aria-current={item === bucket ? 'page' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-2 text-2xs transition-colors',
              item === bucket
                ? 'bg-ink font-bold text-bg'
                : 'border border-line font-semibold hover:bg-ink/6',
            )}
          >
            <span>{ORDER_BUCKET_AR[item]}</span>
            {buckets[item] === 0 ? null : (
              <span
                className={cn(
                  'flex min-w-4.5 items-center justify-center rounded-full px-1.5 font-num text-3xs font-bold',
                  item === bucket ? 'bg-bg/20' : 'bg-ink/8',
                )}
              >
                <ArabicNumber value={buckets[item]} />
              </span>
            )}
          </Link>
        ))}
      </nav>

      <OrdersTable rows={rows} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section id="transfers" className="scroll-mt-6 rounded-xl border border-line p-5">
          <h2 className="mb-3 text-3xs font-bold tracking-wide opacity-65">
            مواعيد نقل الملكية هذا الأسبوع
          </h2>
          {transfers.length === 0 ? (
            /**
             * **والفراغُ يقول سببَه**: «لا مواعيد» وحدها تُقرأ عطلًا،
             * و«لا موعد في السبعة القادمة» تقول إنّ الحساب جرى.
             */
            <p className="py-3 text-2xs opacity-70">
              لا موعد نقل ملكية في الأيام السبعة القادمة.
            </p>
          ) : (
            <ul>
              {transfers.map((transfer) => (
                <li
                  key={transfer.orderRef}
                  className="flex items-center gap-3 border-b border-line-2 py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dealer/orders/${transfer.orderRef}`}
                      className="text-2xs font-bold hover:underline"
                    >
                      {when.format(new Date(transfer.at))}
                    </Link>
                    <p className="mt-0.5 text-3xs opacity-70">{transfer.vehicle}</p>
                  </div>
                  <span className="shrink-0 text-2xs opacity-65">{transfer.buyerName ?? '—'}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-3xs leading-loose opacity-70">
            المستندات المطلوبة لكل موعد تظهر في صفحة الطلب — الرخصة، الاستمارة، وإخلاء المخالفات.
          </p>
        </section>

        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-3 text-3xs font-bold tracking-wide opacity-65">المستحق لك</h2>

          <div className="flex items-baseline justify-between gap-3 border-b border-line-2 py-2.5">
            <span className="text-2xs opacity-70">
              محتجز في الضمان (<Quantity unit="heldOrders" count={money.heldCount} />)
            </span>
            {/*
              **وكلُّ رقمٍ يُطابَق بجهةٍ خارجية يُعرض بهللاته** — رسومُ
              البوّابة ١٫٧٠٪ + ريال، فالهللاتُ قاعدةٌ لا شاذّ.
            */}
            <Money amount={money.held} decimals={2} size="sm" />
          </div>

          <div className="flex items-baseline justify-between gap-3 border-b border-line-2 py-2.5">
            <span className="text-2xs opacity-70">
              جاهز للتحويل (<Quantity unit="heldOrders" count={money.readyCount} />)
            </span>
            <Money amount={money.ready} decimals={2} size="sm" className="text-accent-700" />
          </div>

          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <span className="text-2xs opacity-70">
              {/*
                **والنسبةُ من القاعدة السارية لا من نصٍّ مكتوب**: ترميزُ
                التصميم يقول «٠٪ حاليًا»، وهي اليوم صفر — ويومَ ترفعها
                اللوحة تقول البطاقةُ ما صار لا ما كان.
              */}
              عمولة المنصة (<ArabicNumber value={Number(money.commissionPct)} percent />)
            </span>
            <Money amount={money.commission} decimals={2} size="sm" />
          </div>

          <p className="mt-3 rounded-lg border border-line p-4 text-2xs leading-loose opacity-70">
            يفرج عن المبلغ بعد إتمام نقل الملكية وتأكيد المشتري الاستلام، ويحول إلى آيبان
            المعرض في دفعة يومية.
          </p>
        </section>
      </div>
    </DealerShell>
  );
}

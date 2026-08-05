import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { DetailCard, DetailColumns, DetailHeader, Field } from '@/components/admin/DetailShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { adminAuctionDetail } from '@/lib/domain/admin-detail-readers';
import { toArabicDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';

const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * تفاصيل المزاد — المزايدات والعرابين وقرار البائع.
 *
 * ═══ والحالة تُقرأ مع الوقت ═══
 *
 * `status === 'LIVE'` وحدها لا تكفي: الوظيفة الدورية قد لا تكون مرّت،
 * فتُعرض «مباشر» ويردّ الخادم «انتهى المزاد». **وما بين الانقضاء
 * والاحتساب لا نعرف أبلغ الاحتياطي أم لا** — فلا يُقال شيء.
 */
export default async function AdminAuctionDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const { ref } = await params;
  const auction = await adminAuctionDetail(decodeURIComponent(ref));
  if (auction === null) notFound();

  const pending = auction.status === 'LIVE' && auction.timeElapsed;

  return (
    <AdminShell title="تفاصيل المزاد" activeHref="/admin/auctions" admin={admin}>
      <DetailHeader
        backHref="/admin/auctions"
        backLabel="المزادات"
        reference={auction.listingRef}
        title={`${auction.title} — ${auction.city}`}
        badges={
          <>
            {/* لا يُقال «مباشر» بعد انقضاء الوقت، ولا يُقال أبلغ الاحتياطي */}
            <Badge tone={pending ? 'warn' : auction.status === 'LIVE' ? 'accent' : 'neutral'}>
              {pending ? 'انتهى — يُحتسب الآن' : auction.status}
            </Badge>
            {auction.extendedCount === 0 ? null : (
              <Badge tone="neutral">
                تمديدات ({toArabicDigits(String(auction.extendedCount))})
              </Badge>
            )}
          </>
        }
      />

      <DetailColumns
        main={
          <>
            <DetailCard
              title="المزايدات"
              note={`المعروض أعلى ${toArabicDigits(String(auction.bids.length))}`}
            >
              {auction.bids.length === 0 ? (
                <p className="text-2xs opacity-50">لا مزايدات بعد.</p>
              ) : (
                auction.bids.map((bid, index) => (
                  <div
                    key={bid.id}
                    className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-0"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="bidi-isolate truncate text-2xs font-semibold">
                        {bid.bidderName}
                      </span>
                      {index === 0 ? <Badge tone="accent">الأعلى</Badge> : null}
                      {bid.isAuto ? <Badge tone="neutral">آليّة</Badge> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-4">
                      <Money amount={Number(bid.amount)} showCurrency={false} />
                      <span className="font-num text-3xs opacity-45">
                        {riyadh.format(new Date(bid.at))}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </DetailCard>

            <DetailCard
              title="العرابين"
              note={`عربون (${toArabicDigits(String(auction.deposits.length))})`}
            >
              {auction.deposits.length === 0 ? (
                <p className="text-2xs opacity-50">لا عرابين محجوزة.</p>
              ) : (
                auction.deposits.map((deposit) => (
                  <Field
                    key={deposit.id}
                    label={`${deposit.userName} · ${deposit.status}`}
                    value={<Money amount={Number(deposit.amount)} />}
                  />
                ))
              )}
            </DetailCard>
          </>
        }
        side={
          <>
            <DetailCard title="القواعد">
              <Field label="سعر البداية" value={<Money amount={Number(auction.startPrice)} />} />
              <Field
                label="أقلّ فرق"
                value={<Money amount={Number(auction.bidIncrement)} />}
              />
              <Field label="العربون" value={<Money amount={Number(auction.depositAmount)} />} />
              {auction.buyNowPrice === null ? null : (
                <Field label="اشترِ الآن" value={<Money amount={Number(auction.buyNowPrice)} />} />
              )}
              <Field
                label="أعلى مزايدة"
                value={
                  auction.topBid === null ? '—' : <Money amount={Number(auction.topBid)} />
                }
                strong
              />
              {/*
                **الاحتياطي لا يُعرض.** وهو ممنوعٌ في كل استجابة، ولا
                يُستثنى منه شاشةٌ لأن قارئها أدمن.
              */}
              <p className="mt-3 text-3xs opacity-45">
                السعر الاحتياطيّ لا يُعرض هنا — ولا في أي شاشة.
              </p>
            </DetailCard>

            <DetailCard title="التوقيت">
              <Field label="يبدأ" value={riyadh.format(new Date(auction.startsAt))} />
              <Field
                label="ينتهي"
                value={
                  <span className={pending ? 'text-warn' : undefined}>
                    {riyadh.format(new Date(auction.endsAt))}
                  </span>
                }
                strong
              />
              <Field
                label="التمديدات"
                value={<ArabicNumber value={auction.extendedCount} />}
              />
              {auction.sellerDecisionDueAt === null ? null : (
                <Field
                  label="مهلة قرار البائع"
                  value={riyadh.format(new Date(auction.sellerDecisionDueAt))}
                />
              )}
            </DetailCard>

            <DetailCard title="البائع">
              <Field label="الاسم" value={auction.seller.name} />
              <Link
                href={`/admin/users/${auction.seller.id}`}
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
              >
                افتح ملفّه
              </Link>
            </DetailCard>

            <DetailCard title="الإعلان">
              <Field label="المرجع" value={auction.listingRef} ltr />
              <Link
                href={`/admin/listings/${encodeURIComponent(auction.listingRef)}`}
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
              >
                افتح الإعلان
              </Link>
            </DetailCard>
          </>
        }
      />
    </AdminShell>
  );
}

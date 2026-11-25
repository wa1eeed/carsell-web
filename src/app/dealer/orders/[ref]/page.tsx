import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerOrderSellerId } from '@/lib/domain/dealer-desk';
import { getOrder } from '@/lib/domain/orders';
import { DealerShell } from '@/components/dealer/DealerShell';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { OrderScreen } from '@/app/[locale]/(site)/account/orders/[ref]/OrderScreen';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'الطلب — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ صفحةُ الطلب في لوحة المعرض ═══
 *
 * **وُلدت من رابطٍ كان سيُشحن إلى ٤٠٤**: جدولُ `D6` يربط كلَّ مرجع،
 * وبطاقةُ المواعيد تقول «المستندات المطلوبة لكل موعد تظهر في صفحة
 * الطلب» — ووعدٌ يُفرض أو يُحذف.
 *
 * **والشاشةُ هي شاشةُ المتجر نفسُها** (`OrderScreen`): المراحلُ
 * والمالُ والمستنداتُ والمواعيد مبنيّةٌ فيها، ونسخةٌ ثانية تتباعد
 * فيقول الطلبُ للبائع في لوحته غيرَ ما يقوله في حسابه. والتصميمُ لا
 * يرسم لها شاشةً في `Dealer.dc.html`، فلا ترميزَ يُخالَف.
 */
export default async function DealerOrderDetail({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');

  const { ref } = await params;
  const sellerId = await dealerOrderSellerId(actor.dealerId, actor.branchId, ref);
  if (sellerId === null) notFound();

  const order = await getOrder(ref, sellerId, 'ar');
  if (order === null) notFound();

  const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Riyadh',
  });
  const at = (value: string | null): string | null =>
    value === null ? null : date.format(new Date(value));

  return (
    <DealerShell actor={actor} activeHref="/dealer/orders" title={order.ref}>
      <OrderScreen
        order={order}
        locale="ar"
        trail={
          <Link href="/dealer/orders" className="hover:underline">
            الطلبات
          </Link>
        }
        /**
         * **والإلغاء لطرفِ الطلب وحده**: `cancelOrder` تفحص
         * `actorId`، وعضوُ الفريق ليس بائعًا — فزرٌّ يراه يردّه
         * الخادم. والمالكُ هو البائع، فالزرّ له.
         */
        mayCancel={actor.userId === sellerId}
        formatted={{
          createdAt: date.format(new Date(order.createdAt)),
          stageEnteredAt: date.format(new Date(order.stageEnteredAt)),
          paymentDueAt: at(order.paymentDueAt),
          slaDueAt: order.dispute === null ? null : date.format(new Date(order.dispute.slaDueAt)),
          events: order.events.map((event) => date.format(new Date(event.createdAt))),
        }}
      />
    </DealerShell>
  );
}

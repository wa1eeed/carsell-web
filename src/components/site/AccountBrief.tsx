import Link from 'next/link';
import { Quantity } from '@/components/ui/Quantity';
import type { AccountData } from '@/lib/domain/account';
import { orderNeedsBuyer } from '@/lib/domain/order-state';

/**
 * ═══ خلاصةٌ تُقرأ فيُعمَل بها ═══
 *
 * التصميم يكتب تحت التحيّة: «عندك ٦ عروض تنتظر ردّك، وطلب واحد في
 * مرحلة نقل الملكية». والمبنيّ كان يقول «مركباتك وعروضك وطلباتك في
 * مكان واحد» — جملةٌ صحيحة **لا تقول ما ينتظره**.
 *
 * والفرق أن الأولى تُنهي بفعل: من يقرأها يعرف أين يذهب الآن.
 *
 * ═══ ولا تُعرض حين لا شيء ينتظر ═══
 *
 * خلاصةٌ تقول «لا شيء» تشغل مكانًا بلا فائدة — وغيابُها نفسه رسالة.
 */
export function AccountBrief({ data, locale }: { data: AccountData; locale: string }) {
  const waitingOffers = data.offers.filter(
    (offer) => offer.status === 'PENDING' || offer.status === 'COUNTERED',
  ).length;

  /**
   * الطلب في مرحلةٍ تحتاجه هو — لا كل طلبٍ جارٍ.
   *
   * **والحالة تُقرأ مع المرحلة.** كان الفحص على المرحلة وحدها، والإلغاء
   * حالةٌ لا مرحلة — فطلبٌ أُلغي عند الدفع تبقى مرحلتُه `PAYMENT`،
   * فيُعلن هذا البنر بلونٍ أخضر «طلبٌ ينتظر الدفع» عن طلبٍ مات، ويربط
   * إلى شاشةٍ فيها زرُّ دفعٍ كان يعمل. والمحكّ في `order-state` يقرؤه
   * هذا البنر والحارس معًا.
   */
  const actionable = data.orders.filter((order) => orderNeedsBuyer(order.status, order.stage));

  const liveAuctions = data.auctions.filter((row) => row.live).length;
  const inReview = data.listings.filter((row) => row.status === 'PENDING_REVIEW').length;

  const parts: { key: string; node: React.ReactNode }[] = [];

  if (waitingOffers > 0) {
    parts.push({
      key: 'offers',
      node: (
        <Link href={`/${locale}/account/offers`} className="font-bold underline underline-offset-2">
          <Quantity unit="offers" count={waitingOffers} /> تنتظر ردّك
        </Link>
      ),
    });
  }

  for (const order of actionable.slice(0, 2)) {
    parts.push({
      key: order.ref,
      node: (
        <Link
          href={`/${locale}/account/orders/${order.ref}`}
          className="font-bold underline underline-offset-2"
        >
          {order.stage === 'PAYMENT' ? 'طلبٌ ينتظر الدفع' : 'طلبٌ في مرحلة نقل الملكية'}
        </Link>
      ),
    });
  }

  if (liveAuctions > 0) {
    parts.push({
      key: 'auctions',
      node: (
        <span>
          <Quantity unit="auctions" count={liveAuctions} /> جارية
        </span>
      ),
    });
  }

  if (inReview > 0) {
    parts.push({
      key: 'review',
      node: (
        <Link
          href={`/${locale}/account/listings`}
          className="font-bold underline underline-offset-2"
        >
          <Quantity unit="listings" count={inReview} /> قيد المراجعة
        </Link>
      ),
    });
  }

  if (parts.length === 0) return null;

  return (
    <p className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-accent-200 bg-accent-100 p-4.5 text-sm leading-loose text-accent-900">
      <span className="font-bold">عندك:</span>
      {parts.map((part, index) => (
        <span key={part.key} className="flex items-center gap-2">
          {part.node}
          {index < parts.length - 1 ? (
            <span aria-hidden className="opacity-40">·</span>
          ) : null}
        </span>
      ))}
    </p>
  );
}

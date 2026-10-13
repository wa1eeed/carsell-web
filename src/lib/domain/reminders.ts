import { db } from '@/lib/db';
import { deadline } from './deadlines';
import { notifyMany } from './notifications';

/**
 * ═══ التذكير يسبق لحظة الحاجة ═══
 *
 * **ولا شيء كان يذكّر.** `order.payment_due` و`auction.closing` قالبان
 * مزروعان بلا كاتب، ولا وظيفة دورية تنظر في مهلةٍ **قبل** انقضائها —
 * كلُّ ما بُني ينظر فيها **بعده**: `timeoutUnpaidOrders` تُلغي الطلب ثم
 * تخبر صاحبه، و`closeEndedAuctions` تُغلق المزاد ثم تعلن الفائز.
 *
 * فمن اكتشف المهلة بعد سقوطها اكتشفها بعد أن خسر: الطلب أُلغي والإعلان
 * عاد معروضًا، والمزاد أُغلق على مزايدةٍ كان يملك أن يرفع عليها.
 *
 * ═══ ولا يُذكَّر مرّتان ═══
 *
 * المُجدوِل يمرّ كل دقائق، ومهلةٌ «تنقضي بعد ستّ ساعات» تبقى كذلك
 * ساعاتٍ — فتذكيرٌ بلا علامةٍ يُرسل عشرات المرّات. **والعلامة هي الصفّ
 * نفسه**: وجودُ إشعارٍ بهذا المفتاح على هذا الكيان يعني أنه أُرسل، فلا
 * حقلَ جديدًا ولا ترحيل.
 */

/**
 * تذكير الدفع قبل سقوط الطلب.
 *
 * ويُعيد عدد من ذُكِّروا — لا عدد من اقتربت مهلتُهم.
 */
export async function remindPaymentDue(now: Date = new Date()): Promise<number> {
  const hours = await deadline('paymentReminderHours');
  const horizon = new Date(now.getTime() + hours * 3600 * 1000);

  const due = await db.order.findMany({
    where: {
      stage: 'PAYMENT',
      status: 'ACTIVE',
      /** **وما انقضى ليس تذكيرًا** — `timeoutUnpaidOrders` تتولّاه. */
      paymentDueAt: { gt: now, lte: horizon },
    },
    select: { ref: true, buyerId: true, totalAmount: true, paymentDueAt: true },
  });
  if (due.length === 0) return 0;

  const already = await db.notification.findMany({
    where: {
      templateKey: 'order.payment_due',
      entityType: 'Order',
      entityId: { in: due.map((row) => row.ref) },
    },
    select: { entityId: true },
  });
  const sent = new Set(already.map((row) => row.entityId));

  const fresh = due.filter((row) => !sent.has(row.ref));
  if (fresh.length === 0) return 0;

  await notifyMany(
    fresh.map((order) => ({
      userId: order.buyerId,
      templateKey: 'order.payment_due',
      priority: 'critical' as const,
      payload: {
        ref: order.ref,
        amount: order.totalAmount.toString(),
        /**
         * الساعات المتبقّية **محسوبة لا منقولة من الإعداد**: المُجدوِل
         * قد يتأخّر، فطلبٌ بقيت له ساعتان يقرأ «ستّ ساعات» لو نُقل
         * الإعداد كما هو — ورقمٌ يكذب في تذكيرٍ أسوأ من لا تذكير.
         */
        hours: String(
          Math.max(
            1,
            Math.round(((order.paymentDueAt?.getTime() ?? now.getTime()) - now.getTime()) / 3_600_000),
          ),
        ),
      },
      entityType: 'Order' as const,
      entityId: order.ref,
    })),
  );

  return fresh.length;
}

/**
 * تذكير إغلاق المزاد — **لمن زايد فيه**.
 *
 * وهم وحدهم من يملك أن يرفع، ومن لم يزايد لم يُبدِ نيّةً بعد.
 */
export async function remindClosingAuctions(now: Date = new Date()): Promise<number> {
  const minutes = await deadline('auctionClosingReminderMinutes');
  const horizon = new Date(now.getTime() + minutes * 60_000);

  const closing = await db.auction.findMany({
    where: { status: 'LIVE', endsAt: { gt: now, lte: horizon } },
    select: { id: true, endsAt: true, listing: { select: { ref: true } } },
  });
  if (closing.length === 0) return 0;

  const already = await db.notification.findMany({
    where: {
      templateKey: 'auction.closing',
      entityType: 'Auction',
      entityId: { in: closing.map((row) => row.id) },
    },
    select: { entityId: true },
  });
  const sent = new Set(already.map((row) => row.entityId));

  let reminded = 0;
  const { notifyClosingSoon } = await import('./auction-notify');

  for (const auction of closing) {
    if (sent.has(auction.id)) continue;

    const bidders = await db.bid.findMany({
      where: { auctionId: auction.id },
      select: { bidderId: true },
      distinct: ['bidderId'],
    });
    if (bidders.length === 0) continue;

    await notifyClosingSoon(
      db,
      { id: auction.id, listingRef: auction.listing.ref },
      bidders.map((row) => row.bidderId),
      Math.max(1, Math.round((auction.endsAt.getTime() - now.getTime()) / 60_000)),
    );
    reminded += bidders.length;
  }

  return reminded;
}

/**
 * **ولماذا لا تُذكَّر الطلباتُ المتأخّرة (`order.payment_overdue`)؟**
 *
 * لأنّ المتأخّر لا يعيش لحظةً: `timeoutUnpaidOrders` تُلغيه في أوّل
 * مرورٍ بعد انقضاء مهلته وترسل `order.payment_timeout`. فالقالب بلا
 * لحظةٍ صادقة يُكتب فيها — ومفتاحٌ يُرسَل في لحظةٍ لا تقع هو ضجيجٌ لا
 * حراسة. مسجَّل في `docs/BACKLOG.md` § G.
 */

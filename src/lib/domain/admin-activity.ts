import { db } from '@/lib/db';

/**
 * ═══ مجرى النشاط — ما يقع في السوق الآن ═══
 *
 * اللوحة كانت تُجيب «كم» و«ما الذي ينتظرني»: بطاقاتٌ وطوابير. ولا
 * تُجيب **«ماذا يحدث»** — فمن يفتحها صباحًا لا يعرف أنّ ثلاثة نزاعاتٍ
 * فُتحت ليلًا إلّا بفتح ثلاث شاشات، ولا يرى دفعةً ارتدّت حتى تصير
 * طابورًا.
 *
 * و`/admin/audit` ليست هذا: **أثرُ الأدمن وحده**، فما يفعله السوق
 * بنفسه — إعلانٌ نُشر، عرضٌ قُبل، مزايدةٌ وقعت — ليس فيها.
 *
 * ═══ ولا جدولَ نشاطٍ في المخطّط ═══
 *
 * فالمجرى **يُدمَج من مصادره** كما يُدمَج تاريخ الإعلان: الإعلانات
 * والعروض وأحداث الطلبات والمدفوعات والمزايدات والنزاعات والحسابات
 * الجديدة وأثر الأدمن. وكلُّ مصدرٍ يعرف وقتَه، فيُرتَّب الكلّ تنازليًّا.
 *
 * **وما لا مصدر له لا يُخترَع**: لا «زار فلانٌ إعلانًا» ما دام لا
 * سجلَّ للزيارات.
 */

export type ActivityKind =
  | 'listing'
  | 'offer'
  | 'order'
  | 'payment'
  | 'auction'
  | 'dispute'
  | 'user'
  | 'admin';

export type ActivityEvent = {
  at: string;
  kind: ActivityKind;
  /** مفتاحُ ما وقع — **والصياغة في `labels/activity.ts`** (البوابة ١٧). */
  key: string;
  /**
   * ما وقع عليه — مرجعٌ يُقرأ ويُقارن (`ADS2026A0031` · `ORD-2026-1016`).
   * `null` لما لا مرجع له كحسابٍ جديد.
   */
  subject: string | null;
  /**
   * من فعله — اسمُه، أو `null` حين لا اسم.
   *
   * **وغيابُ الاسم ليس فعلَ النظام.** كان السطر يقول «حسابٌ جديد …
   * بالنظام» لأن المستخدم بلا اسم — والذي سجّل إنسان. فالتفريق صريحٌ
   * في `bySystem` لا مُستنتَجٌ من فراغ.
   */
  actor: string | null;
  /** وقع بالنظام لا بيد أحد — مهلةٌ انقضت، رفضٌ تلقائيّ، وظيفةٌ دورية. */
  bySystem: boolean;
  /** مبلغٌ نصًّا حين يكون للحدث مال — والصياغة في الشاشة. */
  amount: string | null;
  tone: 'neutral' | 'accent' | 'warn' | 'danger';
  href: string | null;
};

export const ACTIVITY_KINDS: readonly ActivityKind[] = [
  'listing',
  'offer',
  'order',
  'payment',
  'auction',
  'dispute',
  'user',
  'admin',
];

export function isActivityKind(value: string): value is ActivityKind {
  return (ACTIVITY_KINDS as readonly string[]).includes(value);
}

const OFFER_TONE: Record<string, ActivityEvent['tone']> = {
  PENDING: 'neutral',
  COUNTERED: 'warn',
  ACCEPTED: 'accent',
  REJECTED: 'neutral',
  AUTO_REJECTED: 'warn',
  EXPIRED: 'neutral',
  WITHDRAWN: 'neutral',
};

export type StreamOptions = {
  /** تضييقٌ على نوعٍ واحد — و`undefined` يعني الكلّ. */
  kind?: ActivityKind;
  /** ما قبل هذه اللحظة — مؤشّرُ الصفحة التالية. */
  before?: Date;
  limit?: number;
};

/**
 * ═══ والمؤشّر زمنٌ لا إزاحة ═══
 *
 * `skip` على ثمانية مصادر مدموجة لا معنى له: الإزاحة في كلٍّ منها
 * غيرُها في المجرى. فكلُّ مصدرٍ يُسأل «أحدثُ `limit` قبل هذه اللحظة»،
 * ثم يُدمج ويُقَصّ — فما سقط من القصّ يصل في الصفحة التالية بمؤشّرها.
 */
export async function activityStream(options: StreamOptions = {}): Promise<ActivityEvent[]> {
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 200);
  const before = options.before ?? new Date();
  const want = (kind: ActivityKind): boolean =>
    options.kind === undefined || options.kind === kind;

  /** يُسحب من كلّ مصدرٍ قدرُ الصفحة — فالمدموج لا ينقص عنها إلّا بنفادها. */
  const take = limit;
  const cutoff = { lt: before };

  const [listings, offers, orderEvents, paymentEvents, bids, disputes, users, audit] =
    await Promise.all([
      !want('listing')
        ? []
        : db.listing.findMany({
            where: { OR: [{ publishedAt: cutoff }, { reviewQueuedAt: cutoff }] },
            orderBy: { publishedAt: 'desc' },
            take,
            select: {
              ref: true,
              status: true,
              publishedAt: true,
              reviewQueuedAt: true,
              reviewReason: true,
              askPrice: true,
              seller: { select: { name: true, phone: true } },
            },
          }),
      !want('offer')
        ? []
        : db.offer.findMany({
            where: { createdAt: cutoff },
            orderBy: { createdAt: 'desc' },
            take,
            select: {
              createdAt: true,
              status: true,
              autoRejected: true,
              amount: true,
              listing: { select: { ref: true } },
              buyer: { select: { name: true, phone: true } },
            },
          }),
      !want('order')
        ? []
        : db.orderEvent.findMany({
            where: { createdAt: cutoff },
            orderBy: { createdAt: 'desc' },
            take,
            select: {
              createdAt: true,
              type: true,
              toStage: true,
              actorType: true,
              order: { select: { ref: true, totalAmount: true } },
            },
          }),
      !want('payment')
        ? []
        : db.paymentEvent.findMany({
            where: { createdAt: cutoff },
            orderBy: { createdAt: 'desc' },
            take,
            select: {
              createdAt: true,
              type: true,
              toStatus: true,
              source: true,
              payment: { select: { amount: true, order: { select: { ref: true } } } },
            },
          }),
      !want('auction')
        ? []
        : db.bid.findMany({
            where: { createdAt: cutoff },
            orderBy: { createdAt: 'desc' },
            take,
            select: {
              createdAt: true,
              amount: true,
              auction: { select: { listing: { select: { ref: true } } } },
            },
          }),
      !want('dispute')
        ? []
        : db.dispute.findMany({
            where: { OR: [{ openedAt: cutoff }, { resolvedAt: cutoff }] },
            orderBy: { openedAt: 'desc' },
            take,
            select: {
              openedAt: true,
              resolvedAt: true,
              status: true,
              resolution: true,
              order: { select: { ref: true } },
            },
          }),
      !want('user')
        ? []
        : db.user.findMany({
            where: { createdAt: cutoff },
            orderBy: { createdAt: 'desc' },
            take,
            select: { createdAt: true, ref: true, name: true },
          }),
      !want('admin')
        ? []
        : db.auditLog.findMany({
            where: { createdAt: cutoff, actorType: 'admin' },
            orderBy: { createdAt: 'desc' },
            take,
            select: { createdAt: true, action: true, entity: true, entityId: true },
          }),
    ]);

  const events: ActivityEvent[] = [];

  for (const listing of listings) {
    const seller = listing.seller.name ?? listing.seller.phone;
    /*
      **والإعلان حدثان لا واحد**: أُحيل إلى المراجعة، ثم نُشر. وأخذُ
      أحدهما يُسقط نصف قصّته من المجرى.
    */
    if (listing.reviewQueuedAt !== null && listing.reviewQueuedAt < before) {
      events.push({
        at: listing.reviewQueuedAt.toISOString(),
        kind: 'listing',
        key: 'listing.queued',
        subject: listing.ref,
        actor: seller,
        bySystem: false,
        amount: null,
        tone: 'warn',
        href: `/admin/listings/${encodeURIComponent(listing.ref)}`,
      });
    }
    if (listing.publishedAt !== null && listing.publishedAt < before) {
      events.push({
        at: listing.publishedAt.toISOString(),
        kind: 'listing',
        key: 'listing.published',
        subject: listing.ref,
        actor: seller,
        bySystem: false,
        amount: listing.askPrice.toString(),
        tone: 'accent',
        href: `/admin/listings/${encodeURIComponent(listing.ref)}`,
      });
    }
  }

  for (const offer of offers) {
    /* الرفض التلقائيّ رايةٌ مع `REJECTED` لا حالةً في التعداد */
    const status = offer.status === 'REJECTED' && offer.autoRejected ? 'AUTO_REJECTED' : offer.status;
    events.push({
      at: offer.createdAt.toISOString(),
      kind: 'offer',
      key: `offer.${status}`,
      subject: offer.listing.ref,
      /** **ولا هويّة مزايدٍ هنا** — والمشتري في العرض يُعرَض للأدمن وحده */
      actor: offer.buyer.name ?? offer.buyer.phone,
      bySystem: status === 'AUTO_REJECTED' || status === 'EXPIRED',
      amount: offer.amount.toString(),
      tone: OFFER_TONE[status] ?? 'neutral',
      href: `/admin/listings/${encodeURIComponent(offer.listing.ref)}?tab=offers`,
    });
  }

  for (const event of orderEvents) {
    events.push({
      at: event.createdAt.toISOString(),
      kind: 'order',
      key: event.type,
      subject: event.order.ref,
      actor: event.actorType === 'system' ? null : event.actorType,
      bySystem: event.actorType === 'system',
      amount: event.type === 'order.created' ? event.order.totalAmount.toString() : null,
      tone: event.toStage === 'DONE' ? 'accent' : 'neutral',
      href: `/admin/orders/${encodeURIComponent(event.order.ref)}`,
    });
  }

  for (const event of paymentEvents) {
    events.push({
      at: event.createdAt.toISOString(),
      kind: 'payment',
      key: `payment.${event.toStatus}`,
      subject: event.payment.order?.ref ?? null,
      actor: event.source === 'system' ? null : event.source,
      bySystem: event.source === 'system',
      amount: event.payment.amount.toString(),
      /*
        **والنبرة من التعداد نفسه لا من اسمٍ مُتخيَّل.** كتبتُ
        `CAPTURED` وليست فيه — والمال يُحجز بـ`HELD` ويدخل بـ`SETTLED`،
        ويرتدّ بـ`RETURNED`. ولولا المترجم لمرّ الفرع ميّتًا.
      */
      tone:
        event.toStatus === 'FAILED'
          ? 'danger'
          : event.toStatus === 'SETTLED' || event.toStatus === 'HELD'
            ? 'accent'
            : event.toStatus === 'RETURNED' || event.toStatus === 'PARTIALLY_RETURNED'
              ? 'warn'
              : 'neutral',
      href:
        event.payment.order === null
          ? null
          : `/admin/orders/${encodeURIComponent(event.payment.order.ref)}`,
    });
  }

  for (const bid of bids) {
    events.push({
      at: bid.createdAt.toISOString(),
      kind: 'auction',
      key: 'auction.bid',
      subject: bid.auction.listing.ref,
      /** هويّة المزايد لا تُكشف — ولا في اللوحة (القاعدة ٨). */
      actor: null,
      bySystem: false,
      amount: bid.amount.toString(),
      tone: 'neutral',
      href: `/admin/auctions/${encodeURIComponent(bid.auction.listing.ref)}`,
    });
  }

  for (const dispute of disputes) {
    if (dispute.openedAt < before) {
      events.push({
        at: dispute.openedAt.toISOString(),
        kind: 'dispute',
        key: 'dispute.opened',
        subject: dispute.order.ref,
        actor: null,
        bySystem: false,
        amount: null,
        tone: 'danger',
        href: `/admin/orders/${encodeURIComponent(dispute.order.ref)}`,
      });
    }
    if (dispute.resolvedAt !== null && dispute.resolvedAt < before) {
      events.push({
        at: dispute.resolvedAt.toISOString(),
        kind: 'dispute',
        key: 'dispute.resolved',
        subject: dispute.order.ref,
        actor: null,
        bySystem: false,
        amount: null,
        tone: 'accent',
        href: `/admin/orders/${encodeURIComponent(dispute.order.ref)}`,
      });
    }
  }

  for (const user of users) {
    events.push({
      at: user.createdAt.toISOString(),
      kind: 'user',
      key: 'user.joined',
      subject: user.ref,
      actor: user.name,
      bySystem: false,
      amount: null,
      tone: 'neutral',
      href: null,
    });
  }

  for (const row of audit) {
    events.push({
      at: row.createdAt.toISOString(),
      kind: 'admin',
      key: row.action,
      /*
        **والكيان مع معرّفه.** `cmv4nncav001ehu5nqls7bff` وحده لا يقول
        على أيّ شيء وقع الإجراء، و«Trim · cmv4…» يقول.
      */
      subject: `${row.entity} · ${row.entityId}`,
      actor: 'admin',
      bySystem: false,
      amount: null,
      tone: 'neutral',
      href: null,
    });
  }

  /** الأحدث أوّلًا — «ماذا يحدث» سؤالُ اللحظة لا سؤالُ التسلسل. */
  events.sort((a, b) => b.at.localeCompare(a.at));
  return events.slice(0, limit);
}

/**
 * عددُ ما وقع منذ لحظةٍ، بالنوع — **للشرائح وللنقطة على التبويبة**.
 *
 * ولا يُحسب من `activityStream`: قصُّ الصفحة يجعل العدّ عدّ المعروض لا
 * عدّ الواقع، فتقول الشريحة «٤٠» مهما وقع.
 */
export async function activityCounts(since: Date): Promise<Record<ActivityKind, number>> {
  const [listings, offers, orders, payments, bids, disputes, users, admin] = await Promise.all([
    db.listing.count({ where: { OR: [{ publishedAt: { gte: since } }, { reviewQueuedAt: { gte: since } }] } }),
    db.offer.count({ where: { createdAt: { gte: since } } }),
    db.orderEvent.count({ where: { createdAt: { gte: since } } }),
    db.paymentEvent.count({ where: { createdAt: { gte: since } } }),
    db.bid.count({ where: { createdAt: { gte: since } } }),
    db.dispute.count({ where: { OR: [{ openedAt: { gte: since } }, { resolvedAt: { gte: since } }] } }),
    db.user.count({ where: { createdAt: { gte: since } } }),
    db.auditLog.count({ where: { createdAt: { gte: since }, actorType: 'admin' } }),
  ]);

  return {
    listing: listings,
    offer: offers,
    order: orders,
    payment: payments,
    auction: bids,
    dispute: disputes,
    user: users,
    admin,
  };
}

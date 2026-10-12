import { db } from '@/lib/db';

/**
 * ═══ تاريخُ الإعلان — حدثًا حدثًا ═══
 *
 * صفحةُ الإعلان كانت بطاقاتٍ تقول **الحال**: منشور، سعرُه كذا، عليه
 * طلب. ولا تقول **كيف وصل إليها**: متى أُنشئ، ومتى أُحيل وبأيّ سبب،
 * ومن راجعه، وأيُّ عرضٍ وصل ومتى سقط، ومتى بِيع.
 *
 * ومن يحقّق في شكوى — «لماذا بِيعت بأقلّ من سعرها؟» — يحتاج التسلسل
 * لا اللقطة. فكان يفتح خمس شاشاتٍ ويُركّب التسلسل في رأسه.
 *
 * ═══ ولا جدولَ أحداثٍ في المخطّط ═══
 *
 * فالتاريخ **يُركَّب من مصادره**: حقولُ الإعلان نفسه، و`AuditLog`،
 * والعروض، والمزايدات، والطلبات وأحداثها، والبلاغات. وكلُّ مصدرٍ
 * يعرف وقتَه، فيُدمَج ويُرتَّب.
 *
 * **وما لا مصدر له لا يُخترَع**: لا «عُدِّل السعر» ما دام لا سجلَّ
 * لتغيّر الأسعار — وسطرٌ مخترَعٌ في تحقيقٍ أسوأ من سطرٍ غائب.
 */

export type TimelineEvent = {
  at: string;
  /**
   * مفتاحُ النوع — **والصياغة في `labels/timeline.ts`**.
   *
   * والنطاق لا يستطيع الصياغة أصلًا: لا يعرف اللغة ولا يملك
   * `Quantity` (البوابة ١٧).
   */
  kind: string;
  detail: string | null;
  /**
   * من فعله — **مفتاحٌ أو اسم**. `null` لما يقع بالنظام، و`'admin'`
   * لفعلٍ إداريّ (تصوغه الشاشة)، وما عداه اسمُ شخصٍ يُعرض كما هو.
   */
  actor: string | null;
  tone: 'neutral' | 'accent' | 'warn' | 'danger';
  /** وجهةٌ تُفتح من السطر — طلبٌ أو بلاغ */
  href: string | null;
};

const OFFER_TONE: Record<string, TimelineEvent['tone']> = {
  ACCEPTED: 'accent',
  REJECTED: 'danger',
  AUTO_REJECTED: 'danger',
  EXPIRED: 'neutral',
  WITHDRAWN: 'neutral',
  COUNTERED: 'warn',
  PENDING: 'warn',
};

export async function listingTimeline(ref: string): Promise<TimelineEvent[]> {
  const listing = await db.listing.findUnique({
    where: { ref },
    select: {
      id: true,
      createdAt: true,
      publishedAt: true,
      closedAt: true,
      closeReason: true,
      reviewQueuedAt: true,
      reviewedAt: true,
      reviewReason: true,
      reviewNote: true,
      seller: { select: { name: true, phone: true } },
      offers: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, amount: true, status: true, autoRejected: true, createdAt: true },
      },
      orders: {
        orderBy: { createdAt: 'asc' },
        select: {
          ref: true,
          createdAt: true,
          source: true,
          totalAmount: true,
          events: {
            orderBy: { createdAt: 'asc' },
            select: { type: true, createdAt: true, toStage: true },
          },
        },
      },
      auction: {
        select: {
          startsAt: true,
          endsAt: true,
          status: true,
          bids: {
            orderBy: { createdAt: 'asc' },
            select: { amount: true, createdAt: true },
          },
        },
      },
    },
  });

  if (listing === null) return [];

  const sellerName = listing.seller.name ?? listing.seller.phone;
  const events: TimelineEvent[] = [];
  const add = (event: TimelineEvent): void => {
    events.push(event);
  };

  /* ① دورةُ حياة الإعلان نفسه */
  /**
   * **و`createdAt` فارغةٌ لما سبق الترحيل.** `Listing` كان بلا تاريخ
   * إنشاء، فالقديم لا نعرف متى أُنشئ — ولا يُخترَع له سطر.
   */
  if (listing.createdAt !== null) {
    add({
      at: listing.createdAt.toISOString(),
      kind: 'listing.created',
      detail: null,
      actor: sellerName,
      tone: 'neutral',
      href: null,
    });
  }

  if (listing.reviewQueuedAt !== null) {
    add({
      at: listing.reviewQueuedAt.toISOString(),
      kind: 'listing.queued',
      // **وسببُ الإحالة يُقال**: مراجعةٌ بلا سبب تُعاد من الصفر
      detail: listing.reviewReason,
      actor: null,
      tone: 'warn',
      href: null,
    });
  }

  if (listing.reviewedAt !== null) {
    add({
      at: listing.reviewedAt.toISOString(),
      kind: 'listing.reviewed',
      detail: listing.reviewNote,
      actor: null,
      tone: 'neutral',
      href: null,
    });
  }

  if (listing.publishedAt !== null) {
    add({
      at: listing.publishedAt.toISOString(),
      kind: 'listing.published',
      detail: null,
      actor: null,
      tone: 'accent',
      href: null,
    });
  }

  if (listing.closedAt !== null) {
    add({
      at: listing.closedAt.toISOString(),
      kind: 'listing.closed',
      detail: listing.closeReason,
      actor: null,
      tone: 'neutral',
      href: null,
    });
  }

  /* ② المزاد ومزايداته */
  if (listing.auction !== null) {
    add({
      at: listing.auction.startsAt.toISOString(),
      kind: 'auction.opened',
      detail: null,
      actor: null,
      tone: 'accent',
      href: null,
    });

    for (const bid of listing.auction.bids) {
      add({
        at: bid.createdAt.toISOString(),
        kind: 'auction.bid',
        detail: bid.amount.toString(),
        /** **وهويّة المزايد لا تُكشف** — ولا في اللوحة: القاعدة ٨. */
        actor: null,
        tone: 'neutral',
        href: null,
      });
    }

    if (listing.auction.status !== 'LIVE' && listing.auction.status !== 'SCHEDULED') {
      add({
        at: listing.auction.endsAt.toISOString(),
        kind: 'auction.closed',
        detail: listing.auction.status,
        actor: null,
        tone: listing.auction.status === 'ENDED_MET' ? 'accent' : 'warn',
        href: null,
      });
    }
  }

  /* ③ العروض */
  for (const offer of listing.offers) {
    /**
     * **والرفض التلقائيّ رايةٌ لا حالة.** `OfferStatus` ليس فيها
     * `AUTO_REJECTED` — بل `REJECTED` ومعها `autoRejected`. فكان
     * الفرعُ هنا ميّتًا منذ بُني، والتسمية «رُفض تلقائيًّا — دون
     * الحدّ» لا تُعرض أبدًا: يُقرأ الرفضُ بالحدّ كرفضٍ من البائع.
     */
    const status = offer.status === 'REJECTED' && offer.autoRejected ? 'AUTO_REJECTED' : offer.status;
    add({
      at: offer.createdAt.toISOString(),
      kind: `offer.${status}`,
      detail: offer.amount.toString(),
      actor: null,
      tone: OFFER_TONE[status] ?? 'neutral',
      href: null,
    });
  }

  /* ④ الطلبات وأحداثها */
  for (const order of listing.orders) {
    add({
      at: order.createdAt.toISOString(),
      kind: 'order.created',
      detail: order.totalAmount.toString(),
      actor: null,
      tone: 'accent',
      href: `/admin/orders/${encodeURIComponent(order.ref)}`,
    });

    for (const event of order.events) {
      // الإنشاء مذكورٌ أعلاه — ولا يُكرَّر سطرُه
      if (event.type === 'order.created') continue;
      add({
        at: event.createdAt.toISOString(),
        kind: event.type,
        detail: event.toStage,
        actor: null,
        tone: 'neutral',
        href: `/admin/orders/${encodeURIComponent(order.ref)}`,
      });
    }
  }

  /* ⑤ أثرُ الأدمن على هذا الإعلان */
  const audit = await db.auditLog.findMany({
    where: { entity: 'Listing', entityId: { in: [listing.id, ref] } },
    orderBy: { createdAt: 'asc' },
    select: { action: true, createdAt: true, actorType: true },
  });

  for (const row of audit) {
    add({
      at: row.createdAt.toISOString(),
      kind: row.action,
      detail: null,
      actor: row.actorType === 'system' ? null : 'admin',
      tone: 'neutral',
      href: null,
    });
  }

  /**
   * **والأقدم أوّلًا.** التحقيق يُقرأ من البداية: «كيف وصل إلى هنا»
   * سؤالٌ تسلسليّ، وعرضُ الأحدث أوّلًا يجعل القارئ يبني القصّة
   * معكوسة.
   */
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

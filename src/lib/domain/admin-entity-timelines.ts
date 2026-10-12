import { db } from '@/lib/db';
import type { TimelineEvent } from './admin-listing-timeline';

/**
 * ═══ خطوطُ زمن الكيانات الباقية ═══
 *
 * قِيست عشرُ صفحات تفاصيل في اللوحة: **تسعٌ بلا تابز ولا خطّ زمن**.
 * وبُني للإعلان ثم للطلب، فبقيت سبعٌ — ونسخُ البناء سبع مرّات يُنتج
 * سبعةَ تخطيطات تتباعد أوّل تعديل.
 *
 * فالمصادر تُدمَج هنا لكلّ كيان، **والصدفة والعرض مشتركان**:
 * `Timeline` و`TIMELINE_LABEL` و`DetailStats` كما هي.
 *
 * ═══ وما لا مصدر له لا يُخترَع ═══
 *
 * `Offer` و`Report` و`Dispute` **بلا جدول أحداث**: لها حالةٌ حاليّة
 * وحقولُ وقتٍ معدودة. فخطُّها يُشتقّ منها ومن `AuditLog`، ولا يُخترَع
 * «غيّر الأدمن الحالة» ما دام لا سجلَّ لتغيّر الحالات.
 */

/** أثرُ الأدمن على كيانٍ بعينه — مشتركٌ بين كل الخطوط. */
async function auditFor(entity: string, ids: readonly string[]): Promise<TimelineEvent[]> {
  const rows = await db.auditLog.findMany({
    where: { entity, entityId: { in: [...ids] } },
    orderBy: { createdAt: 'asc' },
    select: { action: true, createdAt: true, actorType: true },
  });

  return rows.map((row) => ({
    at: row.createdAt.toISOString(),
    kind: row.action,
    detail: null,
    actor: row.actorType === 'system' ? null : 'admin',
    tone: 'neutral' as const,
    href: null,
  }));
}

const oldestFirst = (events: TimelineEvent[]): TimelineEvent[] =>
  events.sort((a, b) => a.at.localeCompare(b.at));

/**
 * ═══ العميل — وما فعله في السوق ═══
 *
 * صفحته كانت أرقامًا ثابتة: كم إعلانًا وكم طلبًا. **ومن يحقّق في شكوى
 * يسأل «ماذا فعل هذا الحساب ومتى»** — أوّلُ إعلانٍ له، وأوّلُ عرض،
 * ومتى وُثّقت هويّته، ومتى اشترى.
 */
export async function userTimeline(id: string): Promise<TimelineEvent[]> {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      listings: {
        orderBy: { publishedAt: 'asc' },
        take: 60,
        select: { ref: true, publishedAt: true, closedAt: true, closeReason: true },
      },
      offers: {
        orderBy: { createdAt: 'asc' },
        take: 60,
        select: { createdAt: true, amount: true, status: true, listing: { select: { ref: true } } },
      },
      ordersAsBuyer: {
        orderBy: { createdAt: 'asc' },
        take: 60,
        select: { ref: true, createdAt: true, totalAmount: true },
      },
      ordersAsSeller: {
        orderBy: { createdAt: 'asc' },
        take: 60,
        select: { ref: true, createdAt: true, totalAmount: true },
      },
      reports: {
        orderBy: { createdAt: 'asc' },
        take: 30,
        select: { ref: true, createdAt: true, reason: true },
      },
    },
  });

  if (user === null) return [];

  const events: TimelineEvent[] = [
    {
      at: user.createdAt.toISOString(),
      kind: 'user.joined',
      detail: null,
      actor: null,
      tone: 'accent',
      href: null,
    },
  ];

  for (const listing of user.listings) {
    if (listing.publishedAt !== null) {
      events.push({
        at: listing.publishedAt.toISOString(),
        kind: 'listing.published',
        detail: listing.ref,
        actor: null,
        tone: 'accent',
        href: `/admin/listings/${encodeURIComponent(listing.ref)}`,
      });
    }
    if (listing.closedAt !== null) {
      events.push({
        at: listing.closedAt.toISOString(),
        kind: 'listing.closed',
        detail: listing.closeReason,
        actor: null,
        tone: 'neutral',
        href: `/admin/listings/${encodeURIComponent(listing.ref)}`,
      });
    }
  }

  for (const offer of user.offers) {
    events.push({
      at: offer.createdAt.toISOString(),
      kind: `offer.${offer.status}`,
      detail: offer.amount.toString(),
      actor: null,
      tone: offer.status === 'ACCEPTED' ? 'accent' : 'neutral',
      href: `/admin/listings/${encodeURIComponent(offer.listing.ref)}`,
    });
  }

  /** **والدورُ يُقال.** «أُنشئ طلب» لا تقول أمشتريًا كان أم بائعًا. */
  for (const [orders, kind] of [
    [user.ordersAsBuyer, 'order.asBuyer'],
    [user.ordersAsSeller, 'order.asSeller'],
  ] as const) {
    for (const order of orders) {
      events.push({
        at: order.createdAt.toISOString(),
        kind,
        detail: order.totalAmount.toString(),
        actor: null,
        tone: 'accent',
        href: `/admin/orders/${encodeURIComponent(order.ref)}`,
      });
    }
  }

  for (const report of user.reports) {
    events.push({
      at: report.createdAt.toISOString(),
      kind: 'report.filed',
      detail: report.reason,
      actor: null,
      tone: 'warn',
      href: `/admin/reports/${encodeURIComponent(report.ref)}`,
    });
  }

  events.push(...(await auditFor('User', [user.id])));
  return oldestFirst(events);
}

/**
 * ═══ المعرض ═══
 *
 * و**هو كيانٌ فوق حساب**: له حالةُ توثيقٍ وخطّةٌ ومستخدمون. فخطُّه
 * تسجيلُه وتوثيقُه وما نشره مستخدموه.
 */
export async function dealerTimeline(id: string): Promise<TimelineEvent[]> {
  const dealer = await db.dealer.findUnique({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      status: true,
      marginSchemeAt: true,
      /**
       * **ومخزونُ المعرض `Vehicle` بـ`dealerId` لا جدولٌ منفصل.**
       * و`Dealer.members` موسومةٌ في المخطّط «مهجورة — انتقل الاعتماد
       * إلى `User`»، فالقراءةُ منها تبني على ما يُحذف.
       */
      vehicles: {
        select: {
          listings: {
            orderBy: { publishedAt: 'asc' },
            take: 60,
            select: { ref: true, publishedAt: true },
          },
        },
      },
    },
  });

  if (dealer === null) return [];

  const events: TimelineEvent[] = [
    {
      at: dealer.createdAt.toISOString(),
      kind: 'dealer.registered',
      detail: null,
      actor: null,
      tone: 'accent',
      href: null,
    },
  ];

  if (dealer.marginSchemeAt !== null) {
    events.push({
      at: dealer.marginSchemeAt.toISOString(),
      kind: 'dealer.marginScheme',
      detail: null,
      actor: 'admin',
      tone: 'warn',
      href: null,
    });
  }

  for (const vehicle of dealer.vehicles) {
    for (const listing of vehicle.listings) {
      if (listing.publishedAt === null) continue;
      events.push({
        at: listing.publishedAt.toISOString(),
        kind: 'listing.published',
        detail: listing.ref,
        actor: null,
        tone: 'neutral',
        href: `/admin/listings/${encodeURIComponent(listing.ref)}`,
      });
    }
  }

  events.push(...(await auditFor('Dealer', [dealer.id])));
  return oldestFirst(events);
}

/**
 * ═══ المزاد ═══
 *
 * **ولا هويّة مزايدٍ هنا** — ولا في اللوحة (القاعدة ٨). والمزايدة
 * مبلغٌ ووقت، ومن زايد يُعرف من الطلب إن رسا.
 */
export async function auctionTimeline(listingRef: string): Promise<TimelineEvent[]> {
  const auction = await db.auction.findFirst({
    where: { listing: { ref: listingRef } },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      sellerDecisionDueAt: true,
      listing: { select: { ref: true, publishedAt: true } },
      bids: { orderBy: { createdAt: 'asc' }, select: { createdAt: true, amount: true } },
      deposits: {
        orderBy: { id: 'asc' },
        select: { amount: true, status: true, releasedAt: true },
      },
    },
  });

  if (auction === null) return [];

  const events: TimelineEvent[] = [
    {
      at: auction.startsAt.toISOString(),
      kind: 'auction.opened',
      detail: null,
      actor: null,
      tone: 'accent',
      href: null,
    },
  ];

  for (const bid of auction.bids) {
    events.push({
      at: bid.createdAt.toISOString(),
      kind: 'auction.bid',
      detail: bid.amount.toString(),
      actor: null,
      tone: 'neutral',
      href: null,
    });
  }

  for (const deposit of auction.deposits) {
    if (deposit.releasedAt === null) continue;
    events.push({
      at: deposit.releasedAt.toISOString(),
      kind: deposit.status === 'FORFEITED' ? 'deposit.forfeited' : 'deposit.released',
      detail: deposit.amount.toString(),
      actor: null,
      tone: deposit.status === 'FORFEITED' ? 'danger' : 'neutral',
      href: null,
    });
  }

  /**
   * **والإغلاق يُقال بعد وقوعه لا عند انقضاء الوقت.** حالةٌ ما زالت
   * `LIVE` أو `SCHEDULED` تعني أن الوظيفة الدورية لم تمرّ — وبين
   * الانقضاء والاحتساب لا نعرف أبلغ الاحتياطي أم لا.
   */
  if (auction.status !== 'LIVE' && auction.status !== 'SCHEDULED') {
    events.push({
      at: auction.endsAt.toISOString(),
      kind: 'auction.closed',
      detail: auction.status,
      actor: null,
      tone: auction.status === 'ENDED_MET' ? 'accent' : 'warn',
      href: null,
    });
  }

  events.push(...(await auditFor('Auction', [auction.id, auction.listing.ref])));
  return oldestFirst(events);
}

/**
 * ═══ العرض وسلسلةُ مقابلاته ═══
 *
 * **ولا جدول أحداثٍ للعرض**: له حالةٌ حاليّة ووقتُ إنشاءٍ ومهلة. وسلسلةُ
 * التفاوض تُقرأ من عروض الإعلان نفسه بين الطرفين — فالمقابل عرضٌ آخر
 * لا حقلٌ في الأوّل.
 */
export async function offerTimeline(id: string): Promise<TimelineEvent[]> {
  const offer = await db.offer.findUnique({
    where: { id },
    select: {
      id: true,
      buyerId: true,
      listingId: true,
      listing: { select: { ref: true } },
    },
  });

  if (offer === null) return [];

  /* كلُّ عروض هذا المشتري على هذا الإعلان — وهي المفاوضة كاملةً */
  const chain = await db.offer.findMany({
    where: { listingId: offer.listingId, buyerId: offer.buyerId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true, amount: true, status: true, autoRejected: true, expiresAt: true },
  });

  const events: TimelineEvent[] = chain.map((row) => ({
    at: row.createdAt.toISOString(),
    /* الرفض التلقائيّ رايةٌ مع `REJECTED` لا حالةً في التعداد */
    kind: `offer.${row.status === 'REJECTED' && row.autoRejected ? 'AUTO_REJECTED' : row.status}`,
    detail: row.amount.toString(),
    actor: null,
    tone:
      row.status === 'ACCEPTED'
        ? ('accent' as const)
        : row.status === 'REJECTED'
          ? ('danger' as const)
          : ('neutral' as const),
    href: null,
  }));

  const orders = await db.order.findMany({
    where: { listingId: offer.listingId, buyerId: offer.buyerId },
    orderBy: { createdAt: 'asc' },
    select: { ref: true, createdAt: true, totalAmount: true },
  });

  for (const order of orders) {
    events.push({
      at: order.createdAt.toISOString(),
      kind: 'order.created',
      detail: order.totalAmount.toString(),
      actor: null,
      tone: 'accent',
      href: `/admin/orders/${encodeURIComponent(order.ref)}`,
    });
  }

  events.push(...(await auditFor('Offer', chain.map((row) => row.id))));
  return oldestFirst(events);
}

/**
 * ═══ النزاع — ورسائلُه في حقل Json ═══
 *
 * `Dispute.messages` مصفوفةُ Json لا جدول، فترتيبُها ترتيبُ كتابتها.
 * **وما لا وقت له لا يدخل خطًّا زمنيًّا**: رسالةٌ بلا طابعٍ تُعرض في
 * التبويبة لا هنا.
 */
export async function disputeTimeline(id: string): Promise<TimelineEvent[]> {
  const dispute = await db.dispute.findUnique({
    where: { id },
    select: {
      id: true,
      openedAt: true,
      slaDueAt: true,
      resolvedAt: true,
      reason: true,
      resolution: true,
      resolutionAmount: true,
      messages: true,
      order: { select: { ref: true, createdAt: true } },
    },
  });

  if (dispute === null) return [];

  const events: TimelineEvent[] = [
    {
      at: dispute.order.createdAt.toISOString(),
      kind: 'order.created',
      detail: dispute.order.ref,
      actor: null,
      tone: 'neutral',
      href: `/admin/orders/${encodeURIComponent(dispute.order.ref)}`,
    },
    {
      at: dispute.openedAt.toISOString(),
      kind: 'dispute.opened',
      detail: dispute.reason,
      actor: null,
      tone: 'danger',
      href: null,
    },
  ];

  for (const raw of dispute.messages) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const at = (raw as Record<string, unknown>).at;
    const by = (raw as Record<string, unknown>).by;
    if (typeof at !== 'string') continue;
    events.push({
      at,
      kind: 'dispute.message',
      detail: null,
      actor: typeof by === 'string' ? by : null,
      tone: 'neutral',
      href: null,
    });
  }

  if (dispute.resolvedAt !== null) {
    events.push({
      at: dispute.resolvedAt.toISOString(),
      kind: 'dispute.resolved',
      detail: dispute.resolution,
      actor: 'admin',
      tone: 'accent',
      href: null,
    });
  }

  events.push(...(await auditFor('Dispute', [dispute.id])));
  return oldestFirst(events);
}

/** ═══ البلاغ ═══ ولا جدول أحداثٍ له — حالةٌ وحقلا وقت. */
export async function reportTimeline(ref: string): Promise<TimelineEvent[]> {
  const report = await db.report.findUnique({
    where: { ref },
    select: { id: true, createdAt: true, reason: true, status: true },
  });

  if (report === null) return [];

  const events: TimelineEvent[] = [
    {
      at: report.createdAt.toISOString(),
      kind: 'report.filed',
      detail: report.reason,
      actor: null,
      tone: 'warn',
      href: null,
    },
  ];

  events.push(...(await auditFor('Report', [report.id, ref])));
  return oldestFirst(events);
}

/** ═══ طلب الخدمة ═══ من الطلب إلى الإسناد إلى النتيجة. */
export async function serviceRequestTimeline(ref: string): Promise<TimelineEvent[]> {
  const request = await db.serviceRequest.findUnique({
    where: { ref },
    select: {
      id: true,
      createdAt: true,
      scheduledAt: true,
      dueAt: true,
      status: true,
      amount: true,
      resultUrl: true,
      listing: { select: { ref: true } },
    },
  });

  if (request === null) return [];

  const events: TimelineEvent[] = [
    {
      at: request.createdAt.toISOString(),
      kind: 'service.requested',
      detail: request.amount.toString(),
      actor: null,
      tone: 'accent',
      href:
        request.listing === null
          ? null
          : `/admin/listings/${encodeURIComponent(request.listing.ref)}`,
    },
  ];

  if (request.scheduledAt !== null) {
    events.push({
      at: request.scheduledAt.toISOString(),
      kind: 'service.scheduled',
      detail: null,
      actor: null,
      tone: 'neutral',
      href: null,
    });
  }

  events.push(...(await auditFor('ServiceRequest', [request.id, ref])));
  return oldestFirst(events);
}

/**
 * ═══ الفئة — ومن غيّر ما يُورَّث ═══
 *
 * `Trim` تحمل الهيكل وناقل الحركة والوقود والدفع والمقاعد، **وتُورَّث
 * إلى كل مركبةٍ تُنشأ منها**. فتعديلُ حقلٍ هنا يغيّر ما يُعرض على
 * سياراتٍ قائمة — ولم يكن في الشاشة ما يقول من غيّره ومتى.
 *
 * والمصدر `AuditLog` وحده: لا جدول نسخٍ للفئات، **ولا يُخترَع «كان
 * كذا فصار كذا»** ما دام `before`/`after` قد يكونان فارغين.
 */
export async function trimTimeline(id: string): Promise<TimelineEvent[]> {
  return oldestFirst(await auditFor('Trim', [id]));
}

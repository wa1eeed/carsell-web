import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { publish } from '@/lib/realtime/publish';
import { canonicalPath } from './listing-detail';
import { renderTemplate } from './notification-text';

/**
 * ═══ مركز الإشعارات — والصفّ الذي لا يقرؤه أحد ═══
 *
 * جدول `Notification` كان يُكتب من **خمسة مواضع** بـ**اثني عشر
 * مفتاحًا**: عرضٌ وصل، عرضٌ قُبل، عربونٌ صودر، نزاعٌ فُتح، مهلةُ دفعٍ
 * انقضت. وقارئُه الوحيد في المنتج كلّه **عدّادٌ في إحصاء أدمن**.
 *
 * فالبائع يصله عرضٌ ويُكتب له صفّ، **ولا شاشة في المنتج تعرضه** — لا
 * جرس ولا قائمة ولا نقطة. والمشتري يُصادَر عربونه بإشعارٍ «حرج» لا
 * يراه، فيعرف من كشف بطاقته.
 *
 * ═══ والمدخل واحد ═══
 *
 * كان لكلّ كاتبٍ `db.notification.create` بيده — وأحدهم نسي القالب،
 * فثلاثةُ مفاتيح تُكتب ولا قالب لها: `offer.lost` و`listing.relisted`
 * و`order.payment_timeout`. وصفٌّ بمفتاحٍ بلا قالب **يصل فارغًا**.
 *
 * فالكتابة من هنا وحدها (كما `postEntries` للدفتر و`applyState`
 * للحالة)، والبوابة ٣٧ تمنع عودة المفتاح بلا قالب.
 *
 * ═══ والنصّ من القالب لا من الشيفرة ═══
 *
 * `NotificationTemplate` جدولٌ يحرّره الأدمن في A8 — **وكان يحرّر نصًّا
 * لا يعرضه شيء**. فالعرض يُصيَّر منه، فتصير الشاشة بابًا لما يُكتب هناك
 * بدل أن تكون نسخةً ثانية تتباعد عنه أوّل تعديل.
 */

export type NotificationPriority = 'critical' | 'high' | 'normal';

/** الكيانات التي يُعلَّق عليها إشعار — ولكلٍّ وجهةٌ أو لا شيء. */
export type NotificationEntity =
  | 'Auction'
  | 'Offer'
  | 'Order'
  | 'Listing'
  | 'Dispute'
  | 'ServiceRequest'
  /** إيقافُ الحساب ورفعُه — والكيانُ هو صاحبُه نفسه. */
  | 'User';

export type NotifyInput = {
  userId: string;
  templateKey: string;
  priority?: NotificationPriority;
  payload?: Prisma.InputJsonValue;
  entityType?: NotificationEntity;
  entityId?: string;
};

/**
 * ما يقبله `notify` من معاملة — أو العميل نفسه خارجها.
 *
 * **وهو ما تلمسه الدالّة لا أكثر.** كان النوع `TransactionClient` كاملًا،
 * فلا يقبل كاتبًا مُضيَّقًا عمدًا (`listing-state.ts` يحصر نفسه في
 * `listing`) — فيُجبَر المُنادي على توسيع نفسه أو على نسخ الإشعار إلى
 * مُنادِييه. والنوع يصف الحاجة: `notification` وحدها.
 */
type Writer = Pick<Prisma.TransactionClient, 'notification'>;

function data(input: NotifyInput): Prisma.NotificationUncheckedCreateInput {
  return {
    userId: input.userId,
    templateKey: input.templateKey,
    priority: input.priority ?? 'normal',
    ...(input.payload === undefined ? {} : { payload: input.payload }),
    ...(input.entityType === undefined ? {} : { entityType: input.entityType }),
    ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
  };
}

/**
 * يكتب إشعارًا واحدًا — **والبثّ بعد الحفظ لا قبله**.
 *
 * الحقيقة في Postgres والرسالة إشعارٌ بتغيّر، فنشرٌ فاشل يؤخّر ظهور
 * النقطة إلى الزيارة التالية ولا يُفقد الإشعار. ولذلك **لا يُرمى**:
 * رفعُ الاستثناء هنا يُفشل المزايدة أو قبول العرض لأن Redis غائب.
 *
 * و`tx` يُمرَّر حين يكون الإشعار جزءًا من معاملة الحدث الذي سبّبه —
 * فإمّا وقع الحدث وإشعارُه معًا أو لم يقع أيٌّ منهما.
 */
/**
 * ═══ والمفتاح يُقرأ — ولم يكن له طريق ═══
 *
 * `PushChannel` و`NotificationPreference` و`setPreference` و
 * `isChannelEnabled` مبنيّةٌ كلُّها منذ A10، **ولا طريق من قالبٍ
 * مُرسَل إلى القناة التي يُطفئها صاحبه** — فلم يُكتب صفُّ تفضيلٍ
 * واحد، ولا قُرئ مفتاحٌ قطّ.
 *
 * و`pushChannelKey` على القالب هو الطريق. **و`null` تصل دائمًا**:
 * النزاع وحالُ الحساب لا يُطفآن، وما لم يُصنَّف لا يُمنع — فالصمت
 * أسلم من كتمٍ لم يُقصد.
 *
 * **والحرِج لا يُطفأ أصلًا**: `isChannelEnabled` تُعيد `true` لقناةٍ
 * غير قابلةٍ للتحكّم بلا أن تقرأ التفضيل — فلا بابَ لخطأ سطرٍ يُسكِت
 * إشعار دفعٍ للجميع (معيار A10).
 *
 * **ولا تُقرأ داخل معاملة**: `tx` تعني أنّ النداء جزءٌ من كتابةٍ
 * أكبر، وقراءةٌ إضافية فيها تُطيل قفلها. فالتفضيل يُقرأ خارجها وحدها.
 */
async function muted(input: NotifyInput, tx?: Writer): Promise<boolean> {
  if (tx !== undefined) return false;

  const template = await db.notificationTemplate.findUnique({
    where: { key: input.templateKey },
    select: { pushChannelKey: true },
  });
  const channel = template?.pushChannelKey ?? null;
  if (channel === null) return false;

  const { isChannelEnabled } = await import('./push-channels');
  return !(await isChannelEnabled(input.userId, channel));
}

export async function notify(input: NotifyInput, tx?: Writer): Promise<void> {
  if (await muted(input, tx)) return;

  const row = await (tx ?? db).notification.create({
    data: data(input),
    select: { id: true },
  });

  await announce(input.userId, row.id, input.templateKey, input.priority ?? 'normal');
}

/**
 * يكتب إشعارًا لعدّة مستلمين — **صفٌّ لكلٍّ لا صفٌّ مشترك**.
 *
 * ومن يُخطَر هنا جمعٌ (كل مزايدٍ خسر)، فالكتابة دفعةٌ واحدة والبثّ
 * لكلٍّ على قناته.
 */
export async function notifyMany(inputs: readonly NotifyInput[], tx?: Writer): Promise<void> {
  if (inputs.length === 0) return;

  await (tx ?? db).notification.createMany({ data: inputs.map(data) });

  /*
    و`createMany` لا تُعيد المعرّفات، فالبثّ يقول «وصلك جديد» بلا
    معرّف — والعميل يقرأ القائمة من REST كما في كل حدث.
  */
  await Promise.all(
    inputs.map((input) =>
      announce(input.userId, null, input.templateKey, input.priority ?? 'normal'),
    ),
  );
}

async function announce(
  userId: string,
  notificationId: string | null,
  templateKey: string,
  priority: NotificationPriority,
): Promise<void> {
  const unread = await unreadCount(userId);
  await publish(
    {
      type: 'notification.created',
      notificationId,
      templateKey,
      priority,
      unread,
    },
    userId,
  );
}

export type NotificationRow = {
  id: string;
  key: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  /** وجهةٌ تُفتح — **`null` حين لا شاشة لها**، فلا يُعرض رابطٌ يقع في ٤٠٤. */
  href: string | null;
};

/**
 * ═══ الوجهة تُشتقّ ولا تُخمَّن ═══
 *
 * `entityId` ليس واحدًا: الطلب **مرجع** (`ORD-2026-1006`) والإعلان
 * **معرّف** والمزاد **معرّف مزاده** لا مرجع إعلانه. وبناءُ الرابط من
 * المعرّف مباشرةً يُنتج ٤٠٤ صامتة — أو ٣٠١ عند كل نقرة، وهي إشارةٌ
 * لمحرّك البحث أن عناويننا ليست نهائية.
 *
 * **والنزاع بلا شاشةِ مستخدم**، فلا رابط له — وعدّادٌ يربط إلى ٤٠٤
 * أسوأ من عدّادٍ لا يربط.
 *
 * ═══ والوجود يُستعلَم عنه ولو كان المعرّف هو المرجع ═══
 *
 * الطلب كان الاستثناء الوحيد: `entityId` **هو** `ORD-2026-1016`،
 * فبُني رابطُه بلا استعلام — «المرجع معروف، فما الحاجة؟». والحاجة أن
 * **المعروف هو الاسم لا الوجود**: نقرتُ الإشعار فوصلت إلى «لا توجد
 * هذه الصفحة»، والطلب محذوف.
 *
 * **والملكية شرطٌ ثانٍ**: صفحة الطلب لطرفَيه، فرابطٌ إلى طلبِ غيرِهما
 * يفتح ٤٠٤ أيضًا — والمستلم قد يكون مزايدًا خاسرًا لا طرفًا. فيُشترط
 * الطرفان في الاستعلام نفسه لا في الشاشة.
 */
async function destinations(
  locale: string,
  viewerId: string,
  rows: readonly { entityType: string | null; entityId: string | null }[],
): Promise<Map<string, string>> {
  const ids = (type: string): string[] => [
    ...new Set(
      rows
        .filter((row) => row.entityType === type && row.entityId !== null)
        .map((row) => row.entityId as string),
    ),
  ];

  const listingIds = ids('Listing');
  const auctionIds = ids('Auction');
  const offerIds = ids('Offer');
  /**
   * ═══ والنزاع كان معلَنًا بلا وجهة ═══
   *
   * `'Dispute'` في النوع منذ كُتب، وثلاثةُ إشعاراتٍ تكتبه — **ولا سطر
   * يحلّه**. فيصل «فُتح نزاعٌ على طلبك» بأولويةٍ حرجة ولا يُفتح بنقرة،
   * والنزاع أحوجُ ما يكون إلى بابٍ سريع.
   *
   * ووجهتُه صفحةُ طلبه: النزاع يُعرض فيها متصدّرًا، ولا شاشةَ له وحده.
   */
  const disputeIds = ids('Dispute');
  const serviceRefs = ids('ServiceRequest');
  const orderRefs = ids('Order');

  const [listings, auctions, offers, orders, disputes, serviceRequests] = await Promise.all([
    listingIds.length === 0
      ? []
      : db.listing.findMany({
          where: { id: { in: listingIds } },
          select: {
            id: true,
            ref: true,
            city: true,
            vehicle: {
              select: {
                brandName: true,
                modelName: true,
                brand: { select: { slug: true } },
                model: { select: { nameEn: true } },
              },
            },
          },
        }),
    auctionIds.length === 0
      ? []
      : db.auction.findMany({
          where: { id: { in: auctionIds } },
          select: { id: true, listing: { select: { ref: true } } },
        }),
    offerIds.length === 0
      ? []
      : db.offer.findMany({ where: { id: { in: offerIds } }, select: { id: true } }),
    orderRefs.length === 0
      ? []
      : db.order.findMany({
          where: {
            ref: { in: orderRefs },
            OR: [{ buyerId: viewerId }, { sellerId: viewerId }],
          },
          select: { ref: true },
        }),
    /** والملكية شرطٌ هنا كما هي في الطلب — ورابطٌ إلى نزاع غيره يفتح ٤٠٤ */
    disputeIds.length === 0
      ? []
      : db.dispute.findMany({
          where: {
            id: { in: disputeIds },
            order: { OR: [{ buyerId: viewerId }, { sellerId: viewerId }] },
          },
          select: { id: true, order: { select: { ref: true } } },
        }),
    serviceRefs.length === 0
      ? []
      : db.serviceRequest.findMany({
          where: {
            ref: { in: serviceRefs },
            OR: [{ userId: viewerId }, { sellerId: viewerId }],
          },
          select: { ref: true },
        }),
  ]);

  const out = new Map<string, string>();
  for (const listing of listings) {
    /*  مُرمَّز — والعربيّ في href يُشارَك مشوَّهًا ولا يُنقر */
    out.set(`Listing:${listing.id}`, canonicalPath(locale, listing).path);
  }
  for (const auction of auctions) {
    out.set(`Auction:${auction.id}`, `/${locale}/auctions/${auction.listing.ref}`);
  }
  for (const offer of offers) {
    /* لا صفحة لعرضٍ بعينه — والقائمة هي أقرب وجهةٍ صادقة */
    out.set(`Offer:${offer.id}`, `/${locale}/account/offers`);
  }
  for (const order of orders) {
    out.set(`Order:${order.ref}`, `/${locale}/account/orders/${encodeURIComponent(order.ref)}`);
  }
  for (const dispute of disputes) {
    out.set(
      `Dispute:${dispute.id}`,
      `/${locale}/account/orders/${encodeURIComponent(dispute.order.ref)}`,
    );
  }
  for (const request of serviceRequests) {
    out.set(
      `ServiceRequest:${request.ref}`,
      `/${locale}/account/reports/${encodeURIComponent(request.ref)}`,
    );
  }

  return out;
}

export type ListOptions = { unreadOnly?: boolean; limit?: number; locale?: string };

export async function listNotifications(
  userId: string,
  options: ListOptions = {},
): Promise<NotificationRow[]> {
  const locale = options.locale ?? 'ar';
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);

  const rows = await db.notification.findMany({
    where: { userId, ...(options.unreadOnly === true ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      templateKey: true,
      priority: true,
      payload: true,
      entityType: true,
      entityId: true,
      readAt: true,
      createdAt: true,
    },
  });

  if (rows.length === 0) return [];

  const [templates, where] = await Promise.all([
    db.notificationTemplate.findMany({
      where: { key: { in: [...new Set(rows.map((row) => row.templateKey))] } },
      select: { key: true, subjectAr: true, bodyAr: true, subjectEn: true, bodyEn: true },
    }),
    destinations(locale, userId, rows),
  ]);

  const byKey = new Map(templates.map((template) => [template.key, template]));

  return rows.map((row) => {
    const template = byKey.get(row.templateKey);
    const values = asValues(row.payload);
    const subject = locale === 'en' ? template?.subjectEn : template?.subjectAr;
    const body = locale === 'en' ? template?.bodyEn : template?.bodyAr;

    return {
      id: row.id,
      key: row.templateKey,
      priority: priorityOf(row.priority),
      /**
       * **والمفتاح الخام يبقى لما لا قالب له.** سطرٌ يقول
       * `offer.lost` أوضح من سطرٍ فارغ — والفارغ يبدو عطلًا في
       * الشاشة بينما العطل في البيانات. والبوابة ٣٧ تمنع وقوعه.
       */
      title: subject === null || subject === undefined ? row.templateKey : renderTemplate(subject, values),
      body: body === null || body === undefined ? '' : renderTemplate(body, values),
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt === null ? null : row.readAt.toISOString(),
      href:
        row.entityType === null || row.entityId === null
          ? null
          : (where.get(`${row.entityType}:${row.entityId}`) ?? null),
    };
  });
}

function priorityOf(value: string): NotificationPriority {
  return value === 'critical' || value === 'high' ? value : 'normal';
}

/** حمولةُ القالب نصوصًا — وما ليس نصًّا يُصاغ، فالقالب لا يعرف إلّا النصّ. */
function asValues(payload: Prisma.JsonValue | null): Record<string, string> {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

/**
 * يضع علامة القراءة — **وعلى صفوف صاحبها وحدها**.
 *
 * `updateMany` بـ`id: { in: ids }` بلا `userId` يجعل أيّ معرّفٍ
 * مسرَّب يُقرأ إشعارَ غيره؛ والشرط هنا لا في المسار، فالحارس في
 * الشاشة اقتراح.
 */
export async function markRead(userId: string, ids: readonly string[], now = new Date()): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db.notification.updateMany({
    where: { userId, id: { in: [...ids] }, readAt: null },
    data: { readAt: now },
  });
  return result.count;
}

export async function markAllRead(userId: string, now = new Date()): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: now },
  });
  return result.count;
}

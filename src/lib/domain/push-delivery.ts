import { db } from '@/lib/db';

/**
 * ═══ أثرُ الإشعار — أربعُ نسبٍ لكلٍّ منها مقام ═══
 *
 * ترميز A10 يضع فوق جدول القنوات أربع بطاقات: الأذونات الممنوحة،
 * ومعدّل التسليم، ومعدّل الفتح، والإيقاف بعد إشعار. وكانت الشاشة
 * تعرض عدد الأجهزة وحدها — **وهو العدد لا الأثر**، وقاعدةُ A10
 * نفسُها مكتوبةٌ في الترميز: «قياس الأثر لا العدد».
 *
 * ═══ ولا نسبةَ بلا مقام ═══
 *
 * كلُّ واحدةٍ هنا تُعيد بسطَها ومقامَها و`measured`، **ولا تُعيد صفرًا
 * حين لا بيانات**. صفرٌ في بطاقةِ «معدّل التسليم» يُقرأ عطلًا في
 * الإرسال، والحقيقةُ أنه لا إرسال بعد. والشاشة تقول ذلك بنصّها.
 *
 * ═══ ومن يكتب هذه الصفوف ═══
 *
 * التطبيق: يسجّل إذنَه عند طلبه، ويخبرنا بالتسليم والفتح. ولا كاتبَ
 * في الويب، والسببُ مسجَّل في `docs/architecture/editability.md` —
 * فجدولٌ بلا كاتبٍ معلَنٍ هو الصنف الذي أُغلق في هذا المستودع مرارًا،
 * والمعلَن منه ليس عطلًا بل مرحلة.
 *
 * والنطاق يُعيد أرقامًا لا جُملًا (البوابة ١٧).
 */

/** نافذةُ «الإيقاف بعد إشعار» — ساعةٌ وعشرون، كما في الترميز. */
export const OPT_OUT_WINDOW_HOURS = 24;

export type PushRate = {
  /** البسط — ما وقع */
  numerator: number;
  /** المقام — ما كان يمكن أن يقع */
  denominator: number;
  /**
   * **`false` تعني «لا بيانات» لا «صفر»**. والشاشة تفرّق بينهما،
   * فبطاقةٌ تقول ٠٪ ولا إرسالَ أصلًا تتّهم الإرسال.
   */
  measured: boolean;
};

export type PushImpact = {
  permission: PushRate;
  delivery: PushRate;
  open: PushRate;
  optOut: PushRate;
};

function rate(numerator: number, denominator: number): PushRate {
  return { numerator, denominator, measured: denominator > 0 };
}

/**
 * النسبةُ المئوية من `PushRate` — **بخانةٍ عشرية واحدة**.
 *
 * ترميز A10 يكتب «٩٤٫٨٪» لا «٩٥٪»: فرقُ التسليم بين ٩٤٫٨ و٩٥٫٢ قرارُ
 * تشغيلٍ لا زينة، وتقريبُه يُخفي الانحدار حتى يصير نقطةً كاملة.
 */
export function ratePct(value: PushRate): number | null {
  if (!value.measured) return null;
  return Math.round((value.numerator / value.denominator) * 1000) / 10;
}

export async function pushImpact(now: Date = new Date()): Promise<PushImpact> {
  const [asked, granted, sent, delivered, opened] = await Promise.all([
    db.pushPermission.count(),
    db.pushPermission.count({ where: { status: 'granted' } }),
    /**
     * **المقام «ما حوول دفعُه» لا «كلُّ الصفوف»**: صفٌّ ما زال
     * `queued` لم يُحاوَل بعد، فعدُّه في مقام التسليم يُنتج انحدارًا
     * كاذبًا كلّما امتلأ الطابور. والفاشل يدخل المقام — فشلُ التسليم
     * هو ما تقيسه البطاقة.
     */
    db.pushSend.count({ where: { status: { in: ['sent', 'delivered', 'failed'] } } }),
    db.pushSend.count({ where: { status: 'delivered' } }),
    /** والفتحُ من المُسلَّم لا من المُرسَل — ما لم يصل لا يُفتح. */
    db.pushSend.count({ where: { openedAt: { not: null } } }),
  ]);

  return {
    permission: rate(granted, asked),
    delivery: rate(delivered, sent),
    open: rate(opened, delivered),
    optOut: await optOutRate(now),
  };
}

/**
 * ═══ الإيقاف بعد إشعار ═══
 *
 * بسطُها: قناةٌ أطفأها صاحبُها **خلال النافذة بعد إشعارٍ منها**.
 * ومقامُها: كلُّ من وصله إشعارٌ من تلك القناة.
 *
 * **والشرطُ على القناة نفسِها لا على أيّ قناة.** من أطفأ التسويقيّ
 * بعد إشعار مزادٍ لم يُطفئه بسببه، وخلطُهما يجعل قناةً حرجةً تُحمَّل
 * إطفاءَ غيرها.
 */
async function optOutRate(now: Date): Promise<PushRate> {
  const since = new Date(now.getTime() - OPT_OUT_WINDOW_HOURS * 3_600_000);

  const reached = await db.pushSend.findMany({
    where: { userId: { not: null }, status: { in: ['sent', 'delivered'] } },
    select: { userId: true, channelKey: true, sentAt: true },
  });
  if (reached.length === 0) return rate(0, 0);

  /** زوجُ (صاحب · قناة) مرّةً واحدة، وأحدثُ إشعارٍ بلغه. */
  const lastReach = new Map<string, Date>();
  for (const row of reached) {
    if (row.userId === null) continue;
    const key = `${row.userId}\u0000${row.channelKey}`;
    const seen = lastReach.get(key);
    if (seen === undefined || row.sentAt > seen) lastReach.set(key, row.sentAt);
  }

  const muted = await db.notificationPreference.findMany({
    where: { enabled: false, updatedAt: { gte: since } },
    select: { userId: true, channelKey: true, updatedAt: true },
  });

  let within = 0;
  for (const row of muted) {
    const reachedAt = lastReach.get(`${row.userId}\u0000${row.channelKey}`);
    if (reachedAt === undefined) continue;
    const gap = row.updatedAt.getTime() - reachedAt.getTime();
    if (gap >= 0 && gap <= OPT_OUT_WINDOW_HOURS * 3_600_000) within += 1;
  }

  return rate(within, lastReach.size);
}

export type ChannelImpact = {
  channelKey: string;
  delivery: PushRate;
  open: PushRate;
};

/**
 * ونفسُ النسبتين لكل قناة — عمودا «التسليم» و«الفتح» في جدول A10.
 *
 * **وتُجلب دفعةً واحدة**: استعلامٌ لكل قناةٍ يصير سبعةً اليوم وعشرين
 * حين تنمو القنوات، وكلُّها تقرأ الجدول نفسه.
 */
export async function channelImpact(): Promise<ChannelImpact[]> {
  const rows = await db.pushSend.groupBy({
    by: ['channelKey', 'status'],
    _count: { _all: true },
  });
  const openedRows = await db.pushSend.groupBy({
    by: ['channelKey'],
    where: { openedAt: { not: null } },
    _count: { _all: true },
  });

  const sent = new Map<string, number>();
  const delivered = new Map<string, number>();
  for (const row of rows) {
    const count = row._count._all;
    if (row.status === 'sent' || row.status === 'delivered' || row.status === 'failed') {
      sent.set(row.channelKey, (sent.get(row.channelKey) ?? 0) + count);
    }
    if (row.status === 'delivered') {
      delivered.set(row.channelKey, (delivered.get(row.channelKey) ?? 0) + count);
    }
  }
  const opened = new Map(openedRows.map((row) => [row.channelKey, row._count._all]));

  const keys = new Set([...sent.keys(), ...delivered.keys(), ...opened.keys()]);
  return [...keys].map((channelKey) => ({
    channelKey,
    delivery: rate(delivered.get(channelKey) ?? 0, sent.get(channelKey) ?? 0),
    open: rate(opened.get(channelKey) ?? 0, delivered.get(channelKey) ?? 0),
  }));
}

/* ─────────────── الكتابة — ما ينادِيه التطبيق ─────────────── */

export type PermissionStatus = 'granted' | 'denied' | 'provisional';

/**
 * إذنُ الإشعارات كما ردّ به النظام.
 *
 * **ويُكتب عند السؤال وعند الجواب**: صفٌّ يُكتب عند المنح وحده يجعل
 * المقام هو البسط، فتقول البطاقة ١٠٠٪ أبدًا.
 */
export async function recordPermission(
  userId: string,
  status: PermissionStatus,
  platform: string | null = null,
): Promise<void> {
  await db.pushPermission.upsert({
    where: { userId },
    create: {
      userId,
      status,
      platform,
      ...(status === 'granted' || status === 'denied' ? { answeredAt: new Date() } : {}),
    },
    update: {
      status,
      ...(platform === null ? {} : { platform }),
      ...(status === 'granted' || status === 'denied' ? { answeredAt: new Date() } : {}),
    },
  });
}

/**
 * ═══ صفُّ الإرسال يُفتح عند **استحقاق** الدفع لا عند نجاحه ═══
 *
 * يُكتب `queued` حين يُنشأ إشعارٌ لقناةِ دفعٍ لم يُطفئها صاحبُه وله
 * جهازٌ مسجَّل. والدافعُ إلى المزوّد — حين يُبنى — يقلبه إلى `sent`
 * أو `failed`.
 *
 * **و`queued` خارج كل مقام**: صفٌّ لم يُحاوَل بعد ليس تسليمًا فاشلًا،
 * وعدُّه يجعل كلَّ ازدحامٍ في الطابور يُقرأ انهيارًا في التسليم.
 */
export async function queueSend(input: {
  channelKey: string;
  userId: string | null;
  templateKey?: string | null;
  platform?: string | null;
}): Promise<string> {
  const row = await db.pushSend.create({
    data: {
      channelKey: input.channelKey,
      userId: input.userId,
      templateKey: input.templateKey ?? null,
      platform: input.platform ?? null,
      status: 'queued',
    },
    select: { id: true },
  });
  return row.id;
}

export type PushEvent = 'delivered' | 'opened' | 'failed';

/**
 * ═══ وحدثٌ متأخّر لا يرجع بالصفّ إلى الوراء ═══
 *
 * التسليمُ والفتح يصلان بترتيبٍ لا نضمنه، **وفتحٌ يصل قبل تسليمِه
 * يعني أنه سُلّم** — فيُثبَّت الاثنان. وحدثٌ مكرّر لا يُبدّل وقتًا
 * مسجَّلًا: أوّلُ فتحٍ هو الفتح.
 */
export async function recordEvent(
  sendId: string,
  event: PushEvent,
  options: { ownerId?: string; at?: Date; failReason?: string | null } = {},
): Promise<{ ok: boolean }> {
  const at = options.at ?? new Date();
  const failReason = options.failReason ?? null;
  const row = await db.pushSend.findUnique({
    where: { id: sendId },
    select: { id: true, userId: true, deliveredAt: true, openedAt: true, status: true },
  });
  if (row === null) return { ok: false };

  /**
   * ═══ والمرجعُ يطابق صاحبَه لا وجودَه وحده ═══
   *
   * المسارُ يستقبل من الخارج، فمن عرف معرّفَ إرسالةٍ واحدة يستطيع
   * تعليمَها «فُتحت» لغيره — فتكذب بطاقةُ معدّل الفتح بلا أثرٍ يُقرأ.
   * والتحقّق هنا لا في المسار: حارسٌ في طبقةٍ واحدة ليس حارسًا.
   */
  if (options.ownerId !== undefined && row.userId !== options.ownerId) {
    return { ok: false };
  }

  if (event === 'failed') {
    await db.pushSend.update({
      where: { id: sendId },
      data: { status: 'failed', failReason },
    });
    return { ok: true };
  }

  await db.pushSend.update({
    where: { id: sendId },
    data: {
      status: 'delivered',
      ...(row.deliveredAt === null ? { deliveredAt: at } : {}),
      ...(event === 'opened' && row.openedAt === null ? { openedAt: at } : {}),
    },
  });
  return { ok: true };
}

/**
 * ═══ سجلّ الإرسال (A10) ═══
 *
 * البطاقاتُ الأربع تقول **كم**، والجدولُ يقول **لأيّ قناةٍ ومتى**،
 * ولا شيء يقول **لمن**. وسؤالُ المشغّل حين يكتب له مستخدم «لم يصلني
 * إشعار» ليس نسبةً: أهو في الطابور، أم سُلّم ولم يُفتح، أم فشل وبأيّ
 * سبب.
 *
 * و`PushSend` يحمل الجواب منذ بُني — **ولا شيء يقرأ صفوفَه**: القراءةُ
 * كلُّها `count` و`groupBy` للنسب. فالصفُّ يُكتب ولا يُرى.
 *
 * **والمفتاحُ لا يُعرض خامًا**: القناةُ باسمها العربيّ والقالبُ بعنوانه،
 * فمفتاحٌ كـ`viewing.requested` يُقرأ شيفرةً لا خبرًا.
 */
export type PushSendRow = {
  id: string;
  channelKey: string;
  channelNameAr: string;
  templateKey: string | null;
  templateTitleAr: string | null;
  /** صاحبُ الإشعار — واسمُه حين يكون له اسم، وإلّا جوّالُه. */
  userId: string | null;
  userName: string | null;
  platform: string | null;
  status: string;
  failReason: string | null;
  sentAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
};

export type PushSendLog = {
  rows: PushSendRow[];
  /** المجموع في القاعدة كلّها — فالمعروض مقتطعٌ ويُقال مقامُه. */
  total: number;
  /** عددُ كلّ حال — وهو ما يُرشَّح به. */
  byStatus: Record<string, number>;
};

/** ما يُعرض في صفحةٍ واحدة — والمقام مكتوبٌ تحتها. */
export const SEND_LOG_PAGE = 100;

export async function sendLog(
  status: string | null = null,
  take: number = SEND_LOG_PAGE,
): Promise<PushSendLog> {
  const where = status === null ? {} : { status };

  const [rows, total, grouped] = await Promise.all([
    db.pushSend.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      take,
      select: {
        id: true,
        channelKey: true,
        templateKey: true,
        userId: true,
        platform: true,
        status: true,
        failReason: true,
        sentAt: true,
        deliveredAt: true,
        openedAt: true,
        channel: { select: { nameAr: true } },
      },
    }),
    db.pushSend.count({ where }),
    db.pushSend.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  /**
   * **والقالبُ والصاحبُ يُجلبان دفعةً** — لا استعلامٌ لكل صفّ. ومئةُ
   * صفٍّ تعني مئتي استعلامٍ لو جُلبا واحدًا واحدًا.
   */
  const templateKeys = [...new Set(rows.map((row) => row.templateKey).filter((key): key is string => key !== null))];
  const userIds = [...new Set(rows.map((row) => row.userId).filter((id): id is string => id !== null))];

  const [templates, users] = await Promise.all([
    templateKeys.length === 0
      ? []
      : db.notificationTemplate.findMany({
          where: { key: { in: templateKeys } },
          select: { key: true, subjectAr: true },
        }),
    userIds.length === 0
      ? []
      : db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, phone: true } }),
  ]);

  const titleOf = new Map(templates.map((row) => [row.key, row.subjectAr]));
  const nameOf = new Map(users.map((row) => [row.id, row.name ?? row.phone]));

  return {
    rows: rows.map((row) => ({
      id: row.id,
      channelKey: row.channelKey,
      channelNameAr: row.channel.nameAr,
      templateKey: row.templateKey,
      templateTitleAr: row.templateKey === null ? null : (titleOf.get(row.templateKey) ?? null),
      userId: row.userId,
      userName: row.userId === null ? null : (nameOf.get(row.userId) ?? null),
      platform: row.platform,
      status: row.status,
      failReason: row.failReason,
      sentAt: row.sentAt.toISOString(),
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      openedAt: row.openedAt?.toISOString() ?? null,
    })),
    total,
    byStatus: Object.fromEntries(grouped.map((row) => [row.status, row._count._all])),
  };
}

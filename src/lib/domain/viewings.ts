import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import type { ViewingParty, ViewingPeriod, ViewingStatus } from '@/generated/prisma/enums';
import { canonicalPath } from './listing-detail';
import {
  MAX_DAYS_AHEAD,
  MIN_DECLINE_REASON,
  MIN_MEETING_POINT,
  slotEnd,
  slotStart,
} from './viewing-rules';

/**
 * ═══ المعاينة — طرفان لا ثلاثة ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٧): «افعل ما تراه احترافيًّا ويناسب السوق
 * السعودي». وكانت «معاينة» صفًّا في `Service` **بلا صنف مزوّد**، فكلُّ
 * طلبٍ يُردّ `CITY_NOT_COVERED` — وزرُّها في صفحة المركبة، **وهي
 * أكثرُ شاشةٍ يصلها الناس**، يقول «قريبًا».
 *
 * **ولا مزوّدَ في المعاينة**: لقاءٌ بين مشترٍ وبائع، لا طرفَ ثالثًا
 * يؤدّيه ولا مالَ فيه ولا عمولة. فكيانٌ خاصٌّ به.
 */

/** يومٌ بلا ساعة — فالمقارنةُ على اليوم لا على اللحظة */
function atMidnightUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export type ViewingFailure =
  | 'LISTING_NOT_FOUND'
  | 'NOT_PUBLISHED'
  /** صاحبُ الإعلان لا يعاين مركبتَه */
  | 'OWN_LISTING'
  | 'DATE_IN_PAST'
  | 'DATE_TOO_FAR'
  /** له طلبٌ قائمٌ على هذا الإعلان — فلا يُكرّر */
  | 'ALREADY_OPEN'
  | 'VIEWING_NOT_FOUND'
  | 'NOT_YOURS'
  | 'NOT_PENDING'
  | 'REASON_REQUIRED'
  | 'MEETING_POINT_REQUIRED'
  /** اقتراحُ البائع ينتظر المشتري — فلا يقبله البائعُ نفسُه */
  | 'NOT_COUNTERED'
  | 'ALREADY_CLOSED';

export type ViewingResult<T> = { ok: true; value: T } | { ok: false; reason: ViewingFailure };

/**
 * ═══ طلبُ معاينة ═══
 *
 * **والمرجعُ يُبنى من الأعلى لا من العدد** — فجوةٌ واحدة تجعل التالي
 * يصطدم بمرجعٍ قائم.
 */
export async function requestViewing(
  input: {
    listingRef: string;
    buyerId: string;
    onDate: string;
    period: ViewingPeriod;
    note: string | null;
  },
  now: Date = new Date(),
): Promise<ViewingResult<{ ref: string }>> {
  const listing = await db.listing.findUnique({
    where: { ref: input.listingRef },
    select: { id: true, status: true, sellerId: true },
  });
  if (listing === null) return { ok: false, reason: 'LISTING_NOT_FOUND' };
  if (listing.status !== 'PUBLISHED' && listing.status !== 'RESERVED') {
    return { ok: false, reason: 'NOT_PUBLISHED' };
  }
  if (listing.sellerId === input.buyerId) return { ok: false, reason: 'OWN_LISTING' };

  const day = new Date(input.onDate);
  if (Number.isNaN(day.getTime())) return { ok: false, reason: 'DATE_IN_PAST' };
  const onDate = atMidnightUtc(day);

  /** **وما مضى لا يُحجَز**: الفترةُ كلُّها لا اليومُ وحده */
  if (slotEnd(onDate, input.period).getTime() <= now.getTime()) {
    return { ok: false, reason: 'DATE_IN_PAST' };
  }
  const horizon = atMidnightUtc(new Date(now.getTime() + MAX_DAYS_AHEAD * 86_400_000));
  if (onDate.getTime() > horizon.getTime()) return { ok: false, reason: 'DATE_TOO_FAR' };

  /**
   * **ولا يُكرّر طلبًا قائمًا**: عشرةُ طلباتٍ من شخصٍ واحد على إعلانٍ
   * واحد ليست رغبةً أشدّ، هي طابورٌ يُربك البائع فيتجاهله كلَّه.
   */
  const open = await db.viewing.count({
    where: {
      listingId: listing.id,
      buyerId: input.buyerId,
      status: { in: ['REQUESTED', 'COUNTERED', 'CONFIRMED'] },
    },
  });
  if (open > 0) return { ok: false, reason: 'ALREADY_OPEN' };

  const note = input.note?.trim() ?? '';
  const created = await db.$transaction(async (tx) => {
    const ref = await nextViewingRef(tx, now);
    return tx.viewing.create({
      data: {
        ref,
        listingId: listing.id,
        buyerId: input.buyerId,
        sellerId: listing.sellerId,
        onDate,
        period: input.period,
        buyerNote: note === '' ? null : note,
      },
      select: { ref: true },
    });
  });

  /**
   * **والطرفُ الثاني يُخطَر** — وبلا إخطارٍ يبقى الطلب في شاشةٍ لا
   * يفتحها البائع إلّا صدفةً، فينقضي الموعد وهو لا يعلم.
   */
  const { notify } = await import('./notifications');
  await notify({
    userId: listing.sellerId,
    templateKey: 'viewing.requested',
    entityType: 'Viewing',
    entityId: created.ref,
    payload: { ref: created.ref },
  });

  return { ok: true, value: created };
}

/** `VIW-2026-0001` — والتسلسل من الأعلى لا من العدد */
async function nextViewingRef(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const prefix = `VIW-${now.getFullYear()}-`;
  const rows = await tx.viewing.findMany({
    where: { ref: { startsWith: prefix } },
    select: { ref: true },
  });
  let highest = 0;
  for (const row of rows) {
    const value = Number(row.ref.slice(prefix.length));
    if (Number.isInteger(value) && value > highest) highest = value;
  }
  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
}

/**
 * ═══ ردُّ البائع ═══
 *
 * **والقبول يكشف نقطة اللقاء**، والشاشة تَعِد بذلك منذ بُنيت: «لا
 * يُكشف العنوان إلّا بعد تأكيد الموعد». فالحقل `null` حتى القبول —
 * **وما لا يدخل الكائن لا يتسرّب منه**.
 */
export async function respondToViewing(
  input: {
    ref: string;
    sellerId: string;
    accept: boolean;
    meetingPoint: string | null;
    reason: string | null;
  },
  now: Date = new Date(),
): Promise<ViewingResult<{ status: ViewingStatus }>> {
  const row = await db.viewing.findUnique({
    where: { ref: input.ref },
    select: { id: true, sellerId: true, buyerId: true, status: true },
  });
  if (row === null) return { ok: false, reason: 'VIEWING_NOT_FOUND' };
  if (row.sellerId !== input.sellerId) return { ok: false, reason: 'NOT_YOURS' };
  if (row.status !== 'REQUESTED') return { ok: false, reason: 'NOT_PENDING' };

  const meetingPoint = input.meetingPoint?.trim() ?? '';
  const reason = input.reason?.trim() ?? '';

  if (input.accept && meetingPoint.length < MIN_MEETING_POINT) {
    return { ok: false, reason: 'MEETING_POINT_REQUIRED' };
  }
  /** **و«رُفض» بلا سببٍ تُعيد الطالب إلى الحيرة** — أيُعيد الطلب أم يبحث؟ */
  if (!input.accept && reason.length < MIN_DECLINE_REASON) {
    return { ok: false, reason: 'REASON_REQUIRED' };
  }

  const status: ViewingStatus = input.accept ? 'CONFIRMED' : 'DECLINED';
  const { count } = await db.viewing.updateMany({
    where: { id: row.id, status: 'REQUESTED' },
    data: {
      status,
      respondedAt: now,
      meetingPoint: input.accept ? meetingPoint : null,
      declineReason: input.accept ? null : reason,
    },
  });
  if (count === 0) return { ok: false, reason: 'NOT_PENDING' };

  const { notify } = await import('./notifications');
  await notify({
    userId: row.buyerId,
    templateKey: input.accept ? 'viewing.confirmed' : 'viewing.declined',
    entityType: 'Viewing',
    entityId: input.ref,
    payload: { ref: input.ref },
  });

  return { ok: true, value: { status } };
}

/**
 * ═══ اقتراحٌ مضادّ من البائع ═══
 *
 * **والاعتذارُ وحده كان يُنهي الحوار**: بائعٌ لا يستطيع السبت ويستطيع
 * الأحد يُضطرّ إلى الرفض، ثمّ ينتظر أن يعيد المشتري الطلب — وأكثرُهم
 * لا يعيد. فاتّفاقٌ ممكنٌ يسقط لأن لا بابَ له.
 *
 * **ونقطةُ اللقاء تُكتب مع الاقتراح**: البائعُ يقترح موعدًا كاملًا لا
 * نصفَه، فقبولُ المشتري يُنهي الحوار بلا جولةٍ ثالثة. وتبقى مخفيّةً
 * حتى القبول كما في الحالة الأولى.
 */
export async function counterViewing(
  input: {
    ref: string;
    sellerId: string;
    onDate: string;
    period: ViewingPeriod;
    meetingPoint: string;
  },
  now: Date = new Date(),
): Promise<ViewingResult<{ status: ViewingStatus }>> {
  const row = await db.viewing.findUnique({
    where: { ref: input.ref },
    select: {
      id: true,
      sellerId: true,
      buyerId: true,
      status: true,
      onDate: true,
      period: true,
      originalDate: true,
      originalPeriod: true,
    },
  });
  if (row === null) return { ok: false, reason: 'VIEWING_NOT_FOUND' };
  if (row.sellerId !== input.sellerId) return { ok: false, reason: 'NOT_YOURS' };
  if (row.status !== 'REQUESTED') return { ok: false, reason: 'NOT_PENDING' };

  const meetingPoint = input.meetingPoint.trim();
  if (meetingPoint.length < MIN_MEETING_POINT) {
    return { ok: false, reason: 'MEETING_POINT_REQUIRED' };
  }

  const day = new Date(input.onDate);
  if (Number.isNaN(day.getTime())) return { ok: false, reason: 'DATE_IN_PAST' };
  const onDate = atMidnightUtc(day);
  /** **والاقتراحُ يخضع لما يخضع له الطلب** — ولا يُقترح ما مضى */
  if (slotEnd(onDate, input.period).getTime() <= now.getTime()) {
    return { ok: false, reason: 'DATE_IN_PAST' };
  }
  const horizon = atMidnightUtc(new Date(now.getTime() + MAX_DAYS_AHEAD * 86_400_000));
  if (onDate.getTime() > horizon.getTime()) return { ok: false, reason: 'DATE_TOO_FAR' };

  const { count } = await db.viewing.updateMany({
    where: { id: row.id, status: 'REQUESTED' },
    data: {
      status: 'COUNTERED',
      onDate,
      period: input.period,
      meetingPoint,
      respondedAt: now,
      /**
       * **وما طُلب أوّلًا يُحفظ مرّةً**: اقتراحٌ ثانٍ لا يقع (الحال
       * `COUNTERED` لا تقبل اقتراحًا)، لكنّ الشرط يحمي من كتابة
       * الاقتراح فوق الطلب لو فُتح الباب لاحقًا.
       */
      originalDate: row.originalDate ?? row.onDate,
      originalPeriod: row.originalPeriod ?? row.period,
    },
  });
  if (count === 0) return { ok: false, reason: 'NOT_PENDING' };

  const { notify } = await import('./notifications');
  await notify({
    userId: row.buyerId,
    templateKey: 'viewing.countered',
    entityType: 'Viewing',
    entityId: input.ref,
    payload: { ref: input.ref },
  });

  return { ok: true, value: { status: 'COUNTERED' } };
}

/**
 * ═══ وقبولُ المشتري للاقتراح ═══
 *
 * **والطرفُ الثاني يُبنى مع الأوّل**: اقتراحٌ يُرسَل ولا يُقبل هو نصفُ
 * باب. ورفضُه إلغاءٌ (`cancelViewing`) — فلا حاجة إلى حالٍ ثالثة
 * لشيءٍ واحد.
 */
export async function acceptCounter(
  input: { ref: string; buyerId: string },
  now: Date = new Date(),
): Promise<ViewingResult<{ status: ViewingStatus }>> {
  const row = await db.viewing.findUnique({
    where: { ref: input.ref },
    select: { id: true, buyerId: true, sellerId: true, status: true },
  });
  if (row === null) return { ok: false, reason: 'VIEWING_NOT_FOUND' };
  if (row.buyerId !== input.buyerId) return { ok: false, reason: 'NOT_YOURS' };
  if (row.status !== 'COUNTERED') return { ok: false, reason: 'NOT_COUNTERED' };

  const { count } = await db.viewing.updateMany({
    where: { id: row.id, status: 'COUNTERED' },
    data: { status: 'CONFIRMED', respondedAt: now },
  });
  if (count === 0) return { ok: false, reason: 'NOT_COUNTERED' };

  const { notify } = await import('./notifications');
  await notify({
    userId: row.sellerId,
    templateKey: 'viewing.confirmed',
    entityType: 'Viewing',
    entityId: input.ref,
    payload: { ref: input.ref },
  });

  return { ok: true, value: { status: 'CONFIRMED' } };
}

/**
 * ═══ الإلغاء — ولكلا الطرفين ═══
 *
 * ظروفُ الناس تتغيّر، **وبلا بابٍ للإلغاء يُترك الموعد قائمًا** فيذهب
 * أحدُهما ولا يجد الآخر. والطرفُ الثاني يُخطَر.
 */
export async function cancelViewing(
  input: { ref: string; userId: string },
  now: Date = new Date(),
): Promise<ViewingResult<{ by: ViewingParty }>> {
  const row = await db.viewing.findUnique({
    where: { ref: input.ref },
    select: { id: true, buyerId: true, sellerId: true, status: true },
  });
  if (row === null) return { ok: false, reason: 'VIEWING_NOT_FOUND' };

  const by: ViewingParty | null =
    row.buyerId === input.userId ? 'BUYER' : row.sellerId === input.userId ? 'SELLER' : null;
  if (by === null) return { ok: false, reason: 'NOT_YOURS' };
  if (row.status !== 'REQUESTED' && row.status !== 'COUNTERED' && row.status !== 'CONFIRMED') {
    return { ok: false, reason: 'ALREADY_CLOSED' };
  }

  const { count } = await db.viewing.updateMany({
    where: { id: row.id, status: { in: ['REQUESTED', 'COUNTERED', 'CONFIRMED'] } },
    data: { status: 'CANCELLED', cancelledBy: by, respondedAt: now },
  });
  if (count === 0) return { ok: false, reason: 'ALREADY_CLOSED' };

  const { notify } = await import('./notifications');
  await notify({
    userId: by === 'BUYER' ? row.sellerId : row.buyerId,
    templateKey: 'viewing.cancelled',
    entityType: 'Viewing',
    entityId: input.ref,
    payload: { ref: input.ref },
  });

  return { ok: true, value: { by } };
}

/**
 * ═══ وما مضى يُغلَق ═══
 *
 * **والحالةُ المخزَّنة لا تكفي متى كان لها وقت**: موعدٌ انقضى وبقي
 * «ينتظر ردًّا» يقول للمشتري إنّ بائعًا قد يردّ، وقد فات اليوم.
 *
 * والمؤكَّدُ يصير `COMPLETED` والمنتظِرُ `EXPIRED` — **فالفرقُ بينهما
 * هو كلُّ ما يُقاس به البائع**: من لا يردّ غيرُ من يردّ ويلتقي.
 */
export async function closePastViewings(now: Date = new Date()): Promise<number> {
  const rows = await db.viewing.findMany({
    where: { status: { in: ['REQUESTED', 'COUNTERED', 'CONFIRMED'] } },
    select: { id: true, status: true, onDate: true, period: true },
  });

  const expired: string[] = [];
  const completed: string[] = [];
  for (const row of rows) {
    if (slotEnd(row.onDate, row.period).getTime() > now.getTime()) continue;
    (row.status === 'CONFIRMED' ? completed : expired).push(row.id);
  }

  if (expired.length > 0) {
    await db.viewing.updateMany({ where: { id: { in: expired } }, data: { status: 'EXPIRED' } });
  }
  if (completed.length > 0) {
    await db.viewing.updateMany({ where: { id: { in: completed } }, data: { status: 'COMPLETED' } });
  }
  return expired.length + completed.length;
}

/**
 * ═══ ما يراه صاحبُ الشأن ═══
 *
 * **ونقطةُ اللقاء لا تخرج قبل القبول**: الشرطُ يقع **حيث يُجلَب** لا
 * حيث يُعرض — وهو مسلكُ `reservePrice` نفسه، فما لا يدخل الكائن لا
 * يتسرّب في حمولة RSC.
 */
export type ViewingRow = {
  ref: string;
  status: ViewingStatus;
  onDate: string;
  period: ViewingPeriod;
  listingRef: string;
  /**
   * **والرابط يُبنى قانونيًّا من أوّله.** `/{locale}/cars/{ref}` يُحوَّل
   * ٣٠٨ عند كل نقرة إلى المسار المعياريّ — وهو ليس رابطًا صحيحًا فيه
   * بطء، بل إشارةٌ لمحرّك البحث أنّ عناويننا ليست نهائية. وقِيس: سبعُ
   * تحويلاتٍ من هذه الشاشة وحدها.
   */
  listingPath: string;
  listingTitle: string;
  city: string;
  /** الطرفُ الآخر — اسمُه وحدَه، والرقمُ يُكشف بنقرةٍ بعد التأكيد */
  counterpartName: string | null;
  counterpartPhoneTail: string | null;
  buyerNote: string | null;
  /**
   * ما طلبه المشتري قبل اقتراح البائع — **فيقرأ الفرقَ لا الموعدَ
   * الجديد وحده**، وإلّا رأى يومًا لم يطلبه ولا يعرف أنه بُدِّل.
   */
  originalDate: string | null;
  originalPeriod: ViewingPeriod | null;
  meetingPoint: string | null;
  declineReason: string | null;
  cancelledBy: ViewingParty | null;
  /** أمضى وقتُه؟ — **والحالةُ وانقضاءُ الوقت معًا** */
  past: boolean;
};

/**
 * ما يُنتظر منّي الآن — وبه تُرتَّب الشاشة ويُحسب العدّاد.
 *
 * **والدورُ ينتقل بالاقتراح المضادّ**: `REQUESTED` على البائع،
 * و`COUNTERED` على المشتري — وعدّادٌ لا يفرّق بينهما يقول لأحدهما إنّ
 * عليه فعلًا وليس عليه.
 */
export function awaitsMe(row: { status: ViewingStatus }, side: ViewingParty): boolean {
  return side === 'SELLER' ? row.status === 'REQUESTED' : row.status === 'COUNTERED';
}

const LIST_SELECT = {
  ref: true,
  status: true,
  onDate: true,
  period: true,
  buyerNote: true,
  originalDate: true,
  originalPeriod: true,
  meetingPoint: true,
  declineReason: true,
  cancelledBy: true,
  buyer: { select: { name: true, phone: true } },
  seller: { select: { name: true, phone: true } },
  listing: {
    select: {
      ref: true,
      city: true,
      /**
       * **وحقلان ناقصان يُنتجان التحويل**: `canonicalPath` تسقط إلى
       * العربية حين تغيب العلاقة، فيصير المسار
       * `/ar/cars/riyadh/toyota/%D9%83%D8%A7%D9%85%D8%B1%D9%8A/…`
       * ويُحوَّل ٣٠٨. **وقِيس مرّتين**: أضفتُ `brand` وحده فبقي الطراز
       * عربيًّا — فالقياسُ بعد الإصلاح لا قبله.
       */
      vehicle: {
        select: {
          brandName: true,
          modelName: true,
          trimName: true,
          year: true,
          brand: { select: { slug: true } },
          model: { select: { nameEn: true } },
        },
      },
    },
  },
} as const;

type ListRow = Prisma.ViewingGetPayload<{ select: typeof LIST_SELECT }>;

function toRow(row: ListRow, side: ViewingParty, locale: string, now: Date): ViewingRow {
  const other = side === 'BUYER' ? row.seller : row.buyer;
  /**
   * **والرقمُ لا يُكشف قبل التأكيد** — فطلبٌ مرفوضٌ أو منتظِرٌ لا
   * يُسرّب رقمَ من لم يقبل بعد.
   */
  const open = row.status === 'CONFIRMED' || row.status === 'COMPLETED';
  /**
   * ═══ ونقطةُ اللقاء يراها كاتبُها دائمًا ═══
   *
   * **وهي بيانُه هو**: البائع يكتبها عند القبول أو مع اقتراحه، فحجبُها
   * عنه حجبُ ما كتبه بيده. قِيس على الشاشة: اقترح موعدًا وكتب الموضع
   * ثمّ لم يرَه — فلا يعرف ماذا وعد به إن سُئل.
   *
   * والمشتري يراها بعد التأكيد وحده، وهو الوعدُ المطبوع على صفحة
   * المركبة.
   */
  const seesMeetingPoint = side === 'SELLER' || open;
  return {
    ref: row.ref,
    status: row.status,
    onDate: row.onDate.toISOString(),
    period: row.period,
    listingRef: row.listing.ref,
    listingPath: canonicalPath(locale, row.listing).path,
    listingTitle: [row.listing.vehicle?.brandName, row.listing.vehicle?.modelName, row.listing.vehicle?.trimName]
      .filter((part) => part !== null && part !== undefined && part !== '')
      .join(' '),
    city: row.listing.city,
    counterpartName: other.name,
    counterpartPhoneTail: open ? other.phone.slice(-4) : null,
    buyerNote: row.buyerNote,
    originalDate: row.originalDate?.toISOString() ?? null,
    originalPeriod: row.originalPeriod,
    meetingPoint: seesMeetingPoint ? row.meetingPoint : null,
    declineReason: row.declineReason,
    cancelledBy: row.cancelledBy,
    past: slotEnd(row.onDate, row.period).getTime() <= now.getTime(),
  };
}

/**
 * مواعيدُ هذا الحساب بالوجهين — **وشاشةٌ واحدة لا شاشتان**: من يبيع
 * ويشتري في المنصّة نفسها لا يتنقّل بين بابين لشيءٍ واحد.
 */
export async function viewingsFor(
  userId: string,
  locale = 'ar',
  now: Date = new Date(),
): Promise<{ asBuyer: ViewingRow[]; asSeller: ViewingRow[] }> {
  const [buying, selling] = await Promise.all([
    db.viewing.findMany({
      where: { buyerId: userId },
      orderBy: [{ onDate: 'desc' }],
      take: 50,
      select: LIST_SELECT,
    }),
    db.viewing.findMany({
      where: { sellerId: userId },
      orderBy: [{ onDate: 'desc' }],
      take: 50,
      select: LIST_SELECT,
    }),
  ]);

  return {
    asBuyer: buying.map((row) => toRow(row, 'BUYER', locale, now)),
    asSeller: selling.map((row) => toRow(row, 'SELLER', locale, now)),
  };
}

/**
 * **وعدّادٌ بلا بابٍ لا يُعرض** — وهذا يربط إلى `/account/viewings`.
 * ويُحسب بما **يُنتظر منه فعلًا**: طلباتٌ على إعلاناته لم يردّ عليها
 * ولم يمضِ وقتُها.
 */
export async function viewingsAwaiting(userId: string, now: Date = new Date()): Promise<number> {
  /**
   * **والدورُ ينتقل بالاقتراح المضادّ**: ما ينتظره بصفته بائعًا
   * (`REQUESTED`) وما ينتظره بصفته مشتريًا (`COUNTERED`) — وعدّادٌ
   * يقرأ أحدهما يُسكت نصفَ ما عليه.
   */
  const rows = await db.viewing.findMany({
    where: {
      OR: [
        { sellerId: userId, status: 'REQUESTED' },
        { buyerId: userId, status: 'COUNTERED' },
      ],
    },
    select: { onDate: true, period: true },
  });
  return rows.filter((row) => slotEnd(row.onDate, row.period).getTime() > now.getTime()).length;
}

/**
 * ═══ التذكير قبل الموعد ═══
 *
 * **والتذكير يسبق لحظة الحاجة** (قاعدة في CLAUDE.md). موعدٌ اتُّفق
 * عليه قبل أسبوعين يُنسى، فيذهب أحدُهما ولا يجد الآخر — وليس بينهما
 * عقدٌ ولا مال، فلا شيء يُلزمهما غير أنهما تذكّرا.
 *
 * **والطرفان يُذكَّران**: من ينسى قد يكون أيَّهما.
 *
 * ولا عمودَ «ذُكِّر»: الإشعارُ نفسُه هو السجلّ — وهو شكلُ
 * `remindPaymentDue` نفسه.
 */
export async function remindUpcomingViewings(now: Date = new Date()): Promise<number> {
  const { deadline } = await import('./deadlines');
  const hours = await deadline('viewingReminderHours');
  const horizon = new Date(now.getTime() + hours * 3_600_000);

  const rows = await db.viewing.findMany({
    where: { status: 'CONFIRMED' },
    select: { ref: true, buyerId: true, sellerId: true, onDate: true, period: true },
  });

  /** **وما بدأ ليس تذكيرًا** — والمقارنة على بداية الفترة لا نهايتها */
  const due = rows.filter((row) => {
    const start = slotStart(row.onDate, row.period).getTime();
    return start > now.getTime() && start <= horizon.getTime();
  });
  if (due.length === 0) return 0;

  const already = await db.notification.findMany({
    where: {
      templateKey: 'viewing.reminder',
      entityType: 'Viewing',
      entityId: { in: due.map((row) => row.ref) },
    },
    select: { entityId: true },
  });
  const sent = new Set(already.map((row) => row.entityId));

  const fresh = due.filter((row) => !sent.has(row.ref));
  if (fresh.length === 0) return 0;

  const { notify } = await import('./notifications');
  for (const row of fresh) {
    for (const userId of [row.buyerId, row.sellerId]) {
      await notify({
        userId,
        templateKey: 'viewing.reminder',
        entityType: 'Viewing',
        entityId: row.ref,
        payload: { ref: row.ref },
      });
    }
  }
  /** ويُعيد عدد المواعيد المُذكَّر بها — لا عدد الإشعارات */
  return fresh.length;
}

import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import type { ServiceRequestStatus } from '@/generated/prisma/enums';
import { deadline } from './deadlines';

/**
 * ═══ رحلةُ طلب الخدمة — ثلاثةُ أطراف لا طرفان ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٤):
 *
 * · **الذي يدفع هو طالبُ الخدمة** بائعًا كان أو مشتريًا. فالبائع يطلب
 *   فحصًا ليزوّد إعلانه بتقرير، والمشتري يطلبه لسيارةٍ قبل أن يشتريها —
 *   والعضوية موحَّدة، والشخص نفسه بائعٌ اليوم مشترٍ غدًا.
 * · **وطلبُ المشتري يمرّ بالبائع**، وبعد قبوله يُطلب السداد.
 * · **وبيانات البائع ومدينته تُكشف للفاحص بعد القبول** لا قبله.
 * · **والطلب يذهب لفاحصي مدينة السيارة.**
 *
 * ═══ وما كان قبل هذا الملف ═══
 *
 * `serviceRequest.create` **واحدةٌ في الشجرة كلّها وصفرُ تحديثات**:
 * يُنشأ الطلب عند `NEW` ويبقى هناك أبدًا. وشاشات الأدمن للقراءة فقط،
 * وصحّةُ الطابور والمهل والتأخّر محسوبةٌ ومعروضة ولا شيء يُحرّكها.
 * فمن دفع ثمن فحصٍ لا يُبلَّغ مزوّدُه ولا يصله تقرير.
 *
 * ═══ ولماذا الحالات قبل `NEW` ═══
 *
 * `NEW` معناها «في طابور المزوّدين» — وهو معناها يوم كان الدفع يسبق
 * الإنشاء. فالانتظارُ قبلها حالتان صريحتان لا غيابُ حال: من ينتظر إذنًا
 * غيرُ من ينتظر سدادًا، وطيُّهما في «جديد» يجعل الطابور يعدّ طلباتٍ لا
 * يملك أحدٌ تحريكها.
 */

export type RequestFailure =
  | 'SERVICE_UNKNOWN'
  | 'VEHICLE_NOT_FOUND'
  /** مركبةُ غيره ولا إعلانَ منشورًا لها — فلا شأن لأحدٍ بسيارةٍ لم تُعرض */
  | 'NOT_LISTED'
  | 'CITY_NOT_COVERED'
  | 'DATE_IN_PAST'
  | 'OWN_LISTING_NO_CONSENT';

export type DecisionFailure =
  | 'REQUEST_NOT_FOUND'
  | 'NOT_SELLER'
  | 'NOT_AWAITING'
  | 'WINDOW_LAPSED'
  | 'REASON_REQUIRED';

/** سببُ الرفض يُكتب — و«رُفض» بلا سببٍ تُعيد الطالب إلى الحيرة. */
export const MIN_DECLINE_REASON = 10;

/**
 * من يملك المركبة، وهل تُفتح لغيره؟
 *
 * **والإعلان المنشور هو ما يفتحها**: معروضٌ للبيع معروضٌ للفحص. ومركبةٌ
 * في جراجٍ بلا إعلان تبقى شأن صاحبها وحده.
 */
export type Subject =
  | { kind: 'OWN'; vehicleId: string; listingId: string | null; city: string | null }
  | { kind: 'LISTED'; vehicleId: string; listingId: string; sellerId: string; city: string };

export type SubjectResult =
  | { ok: true; subject: Subject }
  | { ok: false; reason: 'VEHICLE_NOT_FOUND' | 'NOT_LISTED' };

/**
 * يحلّ موضوعَ الطلب — **والمدينة من الإعلان لا من الطالب**.
 *
 * قرار المالك: «الطلب يذهب لفاحصي نفس المدينة التي فيها السيارة». ومن
 * يطلب فحصًا لسيارةٍ في جدّة وهو في الرياض كان يُرسل الفاحص إلى مدينته
 * هو — فالمدينة صفةُ المركبة لا صفةُ من يسأل عنها.
 */
export async function resolveSubject(
  vehicleId: string,
  requesterId: string,
): Promise<SubjectResult> {
  const vehicle = await db.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      ownerId: true,
      listings: {
        where: { status: 'PUBLISHED' },
        select: { id: true, sellerId: true, city: true },
        take: 1,
      },
    },
  });
  if (vehicle === null) return { ok: false, reason: 'VEHICLE_NOT_FOUND' };

  const listing = vehicle.listings[0] ?? null;

  if (vehicle.ownerId === requesterId) {
    return {
      ok: true,
      subject: {
        kind: 'OWN',
        vehicleId: vehicle.id,
        listingId: listing?.id ?? null,
        city: listing?.city ?? null,
      },
    };
  }

  if (listing === null) return { ok: false, reason: 'NOT_LISTED' };

  return {
    ok: true,
    subject: {
      kind: 'LISTED',
      vehicleId: vehicle.id,
      listingId: listing.id,
      sellerId: listing.sellerId,
      city: listing.city,
    },
  };
}

/**
 * ═══ طابورُ المدينة ═══
 *
 * فاحصو المدينة كلُّهم لا واحدٌ منهم. و`Service.providerId` مزوّدٌ
 * مفضَّل — فلا يصلح طابورًا، والصنفُ هو ما يُجمع به.
 *
 * **ومزوّدٌ بلا حساب دفعٍ مفعَّل لا يدخل الطابور**: يُسنَد إليه طلبٌ
 * فيؤدّيه ثمّ لا سبيل إلى دفع مستحقّه — ودَينٌ يُنشأ بلا طريقٍ لسداده.
 * و`cities` الفارغة تعني تغطيةً شاملة.
 */
export async function cityPool(
  providerType: string | null,
  city: string | null,
): Promise<{ id: string; nameAr: string }[]> {
  if (providerType === null) return [];

  const providers = await db.serviceProvider.findMany({
    where: {
      type: providerType as never,
      active: true,
      accountStatus: { in: ['ACTIVE', 'SEMI_ACTIVE'] },
    },
    select: { id: true, nameAr: true, cities: true },
    orderBy: { nameAr: 'asc' },
  });

  return providers
    .filter((p) => city === null || p.cities.length === 0 || p.cities.includes(city))
    .map((p) => ({ id: p.id, nameAr: p.nameAr }));
}

export type RequestResult =
  | {
      ok: true;
      ref: string;
      status: ServiceRequestStatus;
      /** ما سيُطلب سداده — يُعرض **من اللحظة الأولى** بقرار المالك */
      total: string;
      /** متى يُطلب السداد: الآن، أم بعد إذن البائع */
      payAt: 'NOW' | 'AFTER_CONSENT';
      decisionDueAt: string | null;
    }
  | { ok: false; reason: RequestFailure };

/**
 * يُنشئ الطلب — **بلا مال**.
 *
 * قرار المالك: «بعد قبول البائع يُطلب الدفع من المشتري، حيث يوضَّح
 * المبلغ ومتى يتمّ طلب السداد **من اللحظة الأولى للطلب**». فالطلب
 * يُنشأ ويقول قيمتَه وموعدَ مطالبته، ولا يُحجز ريالٌ قبل أوانه.
 *
 * وكان الحجز يسبق الإنشاء — فطلبُ مشترٍ يرفضه البائع كان سيترك مالًا
 * محجوزًا على بطاقةٍ لصفقةٍ لم تبدأ.
 */
export async function requestService(
  input: {
    serviceKey: string;
    requesterId: string;
    vehicleId: string;
    scheduledAt: string | null;
  },
  now: Date = new Date(),
): Promise<RequestResult> {
  const service = await db.service.findFirst({
    where: { key: input.serviceKey, active: true },
    select: {
      id: true,
      price: true,
      slaHours: true,
      adminFee: true,
      adminFeeEnabled: true,
      adminFeeMode: true,
      providerType: true,
      provider: { select: { id: true, cities: true } },
    },
  });
  if (service === null) return { ok: false, reason: 'SERVICE_UNKNOWN' };

  const resolved = await resolveSubject(input.vehicleId, input.requesterId);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  const subject = resolved.subject;

  if (input.scheduledAt !== null) {
    const at = Date.parse(input.scheduledAt);
    if (!Number.isFinite(at) || at < now.getTime() - 60_000) {
      return { ok: false, reason: 'DATE_IN_PAST' };
    }
  }

  /**
   * **والتغطية تُفحص قبل الطلب لا بعده.** طلبٌ يُنشأ في مدينةٍ لا فاحص
   * فيها يصل البائع فيأذن ثمّ لا أحد يؤدّيه — فيُنتظر مرّتين.
   */
  const pool = await cityPool(service.providerType, subject.city);
  if (pool.length === 0 && service.provider === null) {
    return { ok: false, reason: 'CITY_NOT_COVERED' };
  }

  const { serviceTotal } = await import('./money');
  const { DEFAULT_VAT_PCT } = await import('./tax');
  const platform = await db.platformSetting.findUnique({
    where: { id: 'default' },
    select: { vatPct: true },
  });
  const money = serviceTotal(service.price, platform?.vatPct ?? DEFAULT_VAT_PCT, {
    mode: service.adminFeeMode,
    amount: service.adminFee,
    enabled: service.adminFeeEnabled,
  });

  const needsConsent = subject.kind === 'LISTED';
  const decisionDueAt = needsConsent
    ? new Date(now.getTime() + (await deadline('serviceConsentHours')) * 3_600_000)
    : null;

  /** المهلة تجري من الموعد متى وُجد — الفاحص يحضر ثمّ له ما التزم به. */
  const from = input.scheduledAt === null ? now : new Date(input.scheduledAt);
  const dueAt = new Date(from.getTime() + (service.slaHours ?? 48) * 3_600_000);

  const { nextServiceRequestRef } = await import('./refs');
  const ref = await db.$transaction((tx) => nextServiceRequestRef(tx, now));

  await db.serviceRequest.create({
    data: {
      ref,
      serviceId: service.id,
      userId: input.requesterId,
      vehicleId: subject.vehicleId,
      ...(subject.listingId === null ? {} : { listingId: subject.listingId }),
      ...(subject.kind === 'LISTED' ? { sellerId: subject.sellerId } : {}),
      status: needsConsent ? 'AWAITING_SELLER' : 'AWAITING_PAYMENT',
      ...(decisionDueAt === null ? {} : { decisionDueAt }),
      amount: money.total,
      adminFee: money.platformFee,
      dueAt,
      ...(input.scheduledAt === null ? {} : { scheduledAt: new Date(input.scheduledAt) }),
      ...(subject.city === null ? {} : { city: subject.city }),
      createdAt: now,
    },
  });

  return {
    ok: true,
    ref,
    status: needsConsent ? 'AWAITING_SELLER' : 'AWAITING_PAYMENT',
    total: money.total.toString(),
    payAt: needsConsent ? 'AFTER_CONSENT' : 'NOW',
    decisionDueAt: decisionDueAt?.toISOString() ?? null,
  };
}

export type DecisionResult =
  | { ok: true; status: 'AWAITING_PAYMENT' | 'DECLINED' }
  | { ok: false; reason: DecisionFailure };

/**
 * إذنُ البائع أو رفضُه.
 *
 * **والمهلة تُفحص بالوقت لا بالحالة وحدها** (البوابة ٤٢): الوظيفة
 * الدورية قد لا تكون مرّت، فقبولٌ بعد انقضاء المهلة يُنشئ التزامًا على
 * طلبٍ مات.
 */
export async function decideServiceRequest(
  input: { ref: string; sellerId: string; accept: boolean; reason: string | null },
  now: Date = new Date(),
): Promise<DecisionResult> {
  const request = await db.serviceRequest.findUnique({
    where: { ref: input.ref },
    select: { id: true, status: true, sellerId: true, decisionDueAt: true },
  });

  if (request === null) return { ok: false, reason: 'REQUEST_NOT_FOUND' };
  if (request.sellerId !== input.sellerId) return { ok: false, reason: 'NOT_SELLER' };
  if (request.status !== 'AWAITING_SELLER') return { ok: false, reason: 'NOT_AWAITING' };
  if (request.decisionDueAt !== null && request.decisionDueAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'WINDOW_LAPSED' };
  }

  const reason = input.reason?.trim() ?? '';
  if (!input.accept && reason.length < MIN_DECLINE_REASON) {
    return { ok: false, reason: 'REASON_REQUIRED' };
  }

  await db.serviceRequest.update({
    where: { id: request.id },
    data: {
      status: input.accept ? 'AWAITING_PAYMENT' : 'DECLINED',
      decidedAt: now,
      ...(input.accept ? {} : { declineReason: reason }),
    },
  });

  return { ok: true, status: input.accept ? 'AWAITING_PAYMENT' : 'DECLINED' };
}

/**
 * ما ينقضي إذنُه — **ورفضٌ لا قبول**.
 *
 * فحصٌ يمضي بلا إذنٍ يُرسل فاحصًا إلى بابِ من لم يوافق ويكشف بياناته
 * لمن لم يأذن له. والصمت لا يُقرأ موافقةً حين يكون للصمت ثمنٌ على
 * صاحبه.
 */
export async function lapseServiceConsents(now: Date = new Date()): Promise<number> {
  const stale = await db.serviceRequest.findMany({
    where: { status: 'AWAITING_SELLER', decisionDueAt: { lte: now } },
    select: { id: true },
  });
  if (stale.length === 0) return 0;

  const { count } = await db.serviceRequest.updateMany({
    where: { id: { in: stale.map((row) => row.id) } },
    data: { status: 'DECLINED', decidedAt: now, declineReason: 'consent.lapsed' },
  });
  return count;
}

/** حالاتٌ لم يُؤخذ فيها مال — ولا شيء يُردّ عند انتهائها. */
export const UNPAID_STATUSES: readonly ServiceRequestStatus[] = [
  'AWAITING_SELLER',
  'AWAITING_PAYMENT',
  'DECLINED',
];

/** أدُفع ثمنُ هذا الطلب؟ — سؤالُ كل شاشةٍ تعرض مالًا. */
export function isPaidStatus(status: ServiceRequestStatus): boolean {
  return !UNPAID_STATUSES.includes(status);
}

/**
 * ═══ ما يراه الفاحص عن البائع — وبعد الإذن وحده ═══
 *
 * قرار المالك: «معلومات التواصل مع البائع ومدينته تظهر للفاحص **بعد
 * قبوله**». فالكشف مشروطٌ بالحالة لا بالدور: فاحصٌ يرى جوّال بائعٍ لم
 * يأذن هو تسريبُ بيانات، لا ميزةُ تشغيل.
 *
 * **ويُقرأ أثرُه** كما يُقرأ كشفُ رقم الهوية في A18 — فالكشف فعلٌ له
 * سجلّ لا حقلٌ يُقرأ عرَضًا.
 */
export type SellerContact = { name: string | null; phone: string; city: string | null };

export async function sellerContactFor(
  ref: string,
  tx: Prisma.TransactionClient | typeof db = db,
): Promise<SellerContact | null> {
  const request = await tx.serviceRequest.findUnique({
    where: { ref },
    select: {
      status: true,
      city: true,
      seller: { select: { name: true, phone: true } },
      user: { select: { name: true, phone: true } },
      sellerId: true,
    },
  });
  if (request === null) return null;

  /**
   * **ولا شيء يُكشف قبل أن يدخل الطلب طابور الفاحصين.**
   *
   * الإذن يرفع الطلب إلى «ينتظر السداد»، ولا فاحصَ معنيٌّ به بعد —
   * فالكشف عندئذٍ تسريبٌ سابقٌ لأوانه. والشرط `isPaidStatus` لا
   * قائمةٌ ثانية: شرطان لسؤالٍ واحد يتباعدان أوّل حالٍ تُضاف.
   */
  if (!isPaidStatus(request.status)) return null;

  /**
   * ومن يقابله الفاحص هو **صاحب المركبة**: البائع حين يختلف عن الطالب،
   * والطالبُ نفسه حين تكون المركبة له.
   */
  const party = request.sellerId === null ? request.user : request.seller;
  if (party === null) return null;

  return { name: party.name, phone: party.phone, city: request.city };
}

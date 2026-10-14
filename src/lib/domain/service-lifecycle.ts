import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import type { ServiceRequestStatus } from '@/generated/prisma/enums';
import { deadline } from './deadlines';
import { LAPSED_REASON, MIN_DECLINE_REASON } from './service-rules';

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

/**
 * سببُ الرفض يُكتب — و«رُفض» بلا سببٍ تُعيد الطالب إلى الحيرة.
 * **والقاعدة في وحدةٍ بلا `db`** لتقرأها الشاشة بلا أن تجرّ Prisma.
 */
export { MIN_DECLINE_REASON } from './service-rules';

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

  /**
   * **ومن ينتظر منه فعلٌ يُخبَر.** مهلةُ الإذن تجري منذ هذه اللحظة،
   * ومن لا يعلم بها يدعها تنقضي — فيسقط طلبٌ ما كان ليُرفض.
   *
   * وخارج ما يكتب الحال: طلبٌ أُنشئ لا يُبطَل لأن جرسًا لم يرنّ.
   */
  if (needsConsent && subject.kind === 'LISTED') {
    try {
      await notifyConsentNeeded(
        ref,
        subject.sellerId,
        await deadline('serviceConsentHours'),
      );
    } catch (error) {
      const { reportError } = await import('@/lib/observability/report');
      reportError(error, { where: 'service-lifecycle.request.notify', extra: { ref } });
    }
  }

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
    select: { id: true, status: true, sellerId: true, userId: true, amount: true, decisionDueAt: true },
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

  /**
   * **والقرار يصل صاحبه.** القبول يفتح عليه السداد، والرفض ينهي
   * انتظاره — **ومعه سببُه**: «رُفض» وحدها تُعيده إلى الحيرة، أيعيد
   * الطلب أم يبحث عن سيارةٍ أخرى؟
   */
  try {
    await notifyConsentDecision(input.ref, request.userId, input.accept, {
      amount: request.amount.toString(),
      reason,
    });
  } catch (error) {
    const { reportError } = await import('@/lib/observability/report');
    reportError(error, { where: 'service-lifecycle.decide.notify', extra: { ref: input.ref } });
  }

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
    select: { id: true, ref: true, userId: true },
  });
  if (stale.length === 0) return 0;

  const { count } = await db.serviceRequest.updateMany({
    where: { id: { in: stale.map((row) => row.id) } },
    data: { status: 'DECLINED', decidedAt: now, declineReason: LAPSED_REASON },
  });

  /**
   * **ومن سقط طلبُه يُخبَر.** انتظر إذنًا لم يأتِ، وبلا خبرٍ يبقى
   * ينتظر فحصًا لن يقع — والسقوط صامتًا أسوأ من الرفض بسببه.
   */
  for (const row of stale) {
    try {
      /**
       * **ومفتاحٌ لا جملة** (البوابة ١٧): النطاق لا يعرف اللغة، وجملةٌ
       * يبنيها تُقرأ في قالبٍ يصوغ غيرها. و`consent.lapsed` هو السبب
       * المخزَّن نفسه، تصوغه الشاشة والقالب.
       */
      await notifyConsentDecision(row.ref, row.userId, false, { reason: LAPSED_REASON });
    } catch (error) {
      const { reportError } = await import('@/lib/observability/report');
      reportError(error, { where: 'service-lifecycle.lapse.notify', extra: { ref: row.ref } });
    }
  }

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

export type PayFailure =
  | 'REQUEST_NOT_FOUND'
  | 'NOT_REQUESTER'
  /** ينتظر إذن البائع — والسداد بعده بقرار المالك */
  | 'NOT_AWAITING_PAYMENT'
  | 'NO_ROUTE'
  | 'ROUTE_DISABLED'
  | 'GATEWAY_FAILED'
  | 'REQUIRES_ACTION';

export type PayResult =
  | { ok: true; paymentId: string; total: string }
  | { ok: false; reason: PayFailure; code?: string; actionUrl?: string };

/**
 * ═══ السداد — **بعد الإذن، وبمبلغ الطلب لا بسعر اليوم** ═══
 *
 * قرار المالك: «بعد قبول البائع يُطلب الدفع من المشتري». فالحجز هنا لا
 * عند الطلب، ودفعةٌ تُؤخذ قبل إذنٍ قد لا يأتي تحبس مالًا بلا صفقة.
 *
 * **والمبلغ من الصفّ لا من الخدمة**: سعرٌ يتغيّر بين الطلب والسداد
 * يجعل الطالب يدفع غير ما وُعد به، والوعد قيل له من اللحظة الأولى.
 */
export async function payServiceRequest(
  input: {
    ref: string;
    requesterId: string;
    method: string;
    returnUrl: string;
    idempotencyKey: string;
  },
  now: Date = new Date(),
): Promise<PayResult> {
  const request = await db.serviceRequest.findUnique({
    where: { ref: input.ref },
    select: { id: true, ref: true, status: true, userId: true, amount: true, paymentId: true },
  });

  if (request === null) return { ok: false, reason: 'REQUEST_NOT_FOUND' };
  if (request.userId !== input.requesterId) return { ok: false, reason: 'NOT_REQUESTER' };
  if (request.status !== 'AWAITING_PAYMENT') return { ok: false, reason: 'NOT_AWAITING_PAYMENT' };

  const { resolveGateway } = await import('@/lib/payments/resolve');
  const resolved = await resolveGateway('SERVICE_PURCHASE');
  if (resolved === null) return { ok: false, reason: 'NO_ROUTE' };
  if (!resolved.enabled) return { ok: false, reason: 'ROUTE_DISABLED' };

  const payment = await db.payment.create({
    data: {
      purpose: 'SERVICE_PURCHASE',
      // **لقطة لا إعداد**: ما حُجز هنا يُسوّى من حيث حُجز
      gatewayKey: resolved.gatewayKey,
      environment: resolved.environment,
      amount: request.amount,
      method: input.method,
      status: 'CREATED',
      createdAt: now,
    },
  });

  const held = await resolved.gateway.hold({
    purpose: 'SERVICE_PURCHASE',
    ref: request.ref,
    amount: request.amount.toString(),
    currency: 'SAR',
    method: input.method,
    returnUrl: input.returnUrl,
    idempotencyKey: input.idempotencyKey,
  });

  if (held.state === 'FAILED') {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failedAt: now, failureCode: held.code },
    });
    return { ok: false, reason: 'GATEWAY_FAILED', code: held.code };
  }

  if (held.state === 'REQUIRES_ACTION') {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'PENDING', holdRef: held.holdRef, actionUrl: held.actionUrl },
    });
    /** **والطلب لا يتقدّم قبل أن يُحجز المال** — تحدٍّ لم يُكمَل ليس سدادًا. */
    await db.serviceRequest.update({
      where: { id: request.id },
      data: { paymentId: payment.id },
    });
    return { ok: false, reason: 'REQUIRES_ACTION', actionUrl: held.actionUrl };
  }

  await db.payment.update({
    where: { id: payment.id },
    data: { status: 'HELD', heldAt: now, holdRef: held.holdRef },
  });

  /**
   * **وهنا يدخل الطلب طابور المزوّدين** — وهو معنى `NEW` منذ كُتبت:
   * دُفع المال فصار للمزوّد ما يعمل عليه ومستحقٌّ يقابله.
   */
  await db.serviceRequest.update({
    where: { id: request.id },
    data: { status: 'NEW', paymentId: payment.id },
  });

  return { ok: true, paymentId: payment.id, total: request.amount.toString() };
}

/**
 * ═══ ما يراه طرفا الطلب — ولكلٍّ بقدره ═══
 *
 * شاشةٌ واحدة بوجهين: الطالبُ يرى حالَه ومبلغَه وزرَّ سداده، والبائعُ
 * يرى ما يُطلب على مركبته وقرارَه. **ولا يرى أحدُهما ما ليس له**:
 * بيانات التواصل للفاحص وحده بعد دخول الطابور.
 */
export type RequestView = {
  ref: string;
  /** الرائي: طالبٌ أم صاحبُ المركبة */
  role: 'REQUESTER' | 'SELLER';
  status: ServiceRequestStatus;
  serviceName: string;
  vehicleTitle: string;
  city: string | null;
  total: string;
  platformFee: string;
  createdAt: string;
  scheduledAt: string | null;
  decisionDueAt: string | null;
  declineReason: string | null;
  /** أينتظر هذا الرائي فعلًا شيئًا منه الآن؟ */
  awaitingYou: boolean;
  paid: boolean;
};

export async function serviceRequestView(
  ref: string,
  viewerId: string,
): Promise<RequestView | null> {
  const row = await db.serviceRequest.findUnique({
    where: { ref },
    select: {
      ref: true,
      status: true,
      userId: true,
      sellerId: true,
      city: true,
      amount: true,
      adminFee: true,
      createdAt: true,
      scheduledAt: true,
      decisionDueAt: true,
      declineReason: true,
      service: { select: { nameAr: true } },
      vehicle: { select: { brandName: true, modelName: true, trimName: true, year: true } },
    },
  });
  if (row === null) return null;

  /** **وغيرُ طرفيه يرى ٤٠٤ لا ٤٠٣**: وجودُ الطلب نفسه معلومة. */
  const role =
    row.userId === viewerId ? 'REQUESTER' : row.sellerId === viewerId ? 'SELLER' : null;
  if (role === null) return null;

  const vehicleTitle = [row.vehicle?.brandName, row.vehicle?.modelName, row.vehicle?.trimName]
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join(' ');

  return {
    ref: row.ref,
    role,
    status: row.status,
    serviceName: row.service.nameAr,
    vehicleTitle,
    city: row.city,
    total: row.amount.toString(),
    platformFee: row.adminFee.toString(),
    createdAt: row.createdAt.toISOString(),
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    decisionDueAt: row.decisionDueAt?.toISOString() ?? null,
    declineReason: row.declineReason,
    awaitingYou:
      (role === 'SELLER' && row.status === 'AWAITING_SELLER') ||
      (role === 'REQUESTER' && row.status === 'AWAITING_PAYMENT'),
    paid: isPaidStatus(row.status),
  };
}

/**
 * طلباتٌ تنتظر إذنَ هذا البائع — **وعدّادٌ بلا باب لا يُعرض**.
 *
 * فمن تُطلب مركبتُه للفحص لا يفتح الطلب إلّا من إشعارٍ قد يفوته، وهو
 * الصنف الذي تكرّر: طرفٌ يُبنى بلا الطرف الثاني.
 */
export async function consentsAwaiting(sellerId: string, now: Date = new Date()): Promise<number> {
  return db.serviceRequest.count({
    where: {
      sellerId,
      status: 'AWAITING_SELLER',
      /** **والحالة وانقضاءُ الوقت معًا** (البوابة ٤٢) — فالوظيفة قد لا تمرّ */
      OR: [{ decisionDueAt: null }, { decisionDueAt: { gt: now } }],
    },
  });
}

/**
 * ═══ ومن ينتظر يُخبَر ═══
 *
 * الدورة كلُّها مواعيدُ ينتظرها إنسان: البائع يأذن قبل انقضاء مهلته،
 * والطالبُ يسدّد بعد الإذن أو يعرف لماذا رُفض. **وبلا جرسٍ يُفتح
 * الحسابُ بالصدفة** — وهو ما يجعل المهلة تنقضي على من لم يعلم بها.
 *
 * والوجهة مرجعُ الطلب: `destinations()` تربط `ServiceRequest:{ref}` إلى
 * صفحته، وتشترط أن يكون القارئ أحد طرفيه.
 */
async function bell(
  userId: string,
  templateKey: string,
  ref: string,
  payload: Record<string, string>,
  priority: 'critical' | 'high' | 'normal',
): Promise<void> {
  const { notify } = await import('./notifications');
  await notify({
    userId,
    templateKey,
    priority,
    payload: { ref, ...payload },
    entityType: 'ServiceRequest',
    entityId: ref,
  });
}

/**
 * ═══ وما يقع في الطابور يُخطَر به طالبُه ═══
 *
 * `applyStep` كانت تكتب الحال وتسكت: من دفع ثمنَ فحصٍ لا يعلم أن
 * مركزًا استلمه، ولا أنه أُنجز، ولا أنه تعذّر — **فيعود إلى الشاشة
 * يسأل**، أو لا يعود.
 *
 * وثلاثُ لحظات لا أربع: «بدأ العمل» لا يغيّر شيئًا ممّا يستطيعه
 * الطالب، والإخطار الذي لا يُفضي إلى فعلٍ ولا توقّعٍ جديد ضجيج.
 */
export async function notifyServiceStep(
  ref: string,
  requesterId: string,
  status: 'ASSIGNED' | 'DONE' | 'FAILED',
  serviceName: string,
): Promise<void> {
  const KEY = {
    ASSIGNED: 'service.assigned',
    DONE: 'service.completed',
    FAILED: 'service.failed',
  } as const;
  const PRIORITY = {
    ASSIGNED: 'normal',
    DONE: 'high',
    /** **والفشل حرج**: مالٌ دُفع وخدمةٌ لم تقع. */
    FAILED: 'critical',
  } as const;

  await bell(requesterId, KEY[status], ref, { service: serviceName }, PRIORITY[status]);
}

/** يُخطِر صاحب المركبة أن فحصًا يُطلب عليها — وله مهلة. */
export async function notifyConsentNeeded(
  ref: string,
  sellerId: string,
  hours: number,
): Promise<void> {
  await bell(sellerId, 'service.consent_needed', ref, { hours: String(hours) }, 'critical');
}

/** ويُخطِر الطالبَ بالقرار — ومعه سببُه إن كان رفضًا. */
export async function notifyConsentDecision(
  ref: string,
  requesterId: string,
  accepted: boolean,
  detail: { amount?: string; reason?: string },
): Promise<void> {
  await bell(
    requesterId,
    accepted ? 'service.consent_granted' : 'service.consent_declined',
    ref,
    accepted ? { amount: detail.amount ?? '' } : { reason: detail.reason ?? '' },
    accepted ? 'critical' : 'high',
  );
}

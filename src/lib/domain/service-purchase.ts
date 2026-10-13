import { db } from '@/lib/db';
import { resolveGateway } from '@/lib/payments/resolve';
import { nextServiceRequestRef } from './refs';
import { serviceTotal } from './money';
import { DEFAULT_VAT_PCT } from './tax';

/**
 * ═══ شراء خدمة — وكان لا سبيل إليه ═══
 *
 * تسع خدماتٍ تُعرض، وصفحةُ تفصيلٍ لكلٍّ بسعرها وضريبتها ومهلتها،
 * وطابورٌ كامل في لوحة الأدمن بإسنادٍ جماعيّ والتزامِ مزوّدين —
 * **ولا شيء في المنتج كلّه يُنشئ `ServiceRequest` إلّا البذرة**.
 *
 * وصفحة الخدمة كانت تقول «تُطلب من صفحة المركبة»، وصفحةُ المركبة لا
 * زرّ فيها، وصفحةُ «تقاريري» تقول «اطلب تقريرًا» وتربط إلى صفحة
 * الخدمة. **دائرةٌ مغلقة بلا مدخل** — وخطُّ إيرادٍ كامل بضريبته
 * ومزوّديه لا يدخله ريال.
 *
 * ثالث عشرَ موضعٍ لنمط «قيمةٌ في المخطّط بلا كاتب».
 */

export type ServicePurchaseFailure =
  | 'SERVICE_UNKNOWN'
  | 'VEHICLE_NOT_YOURS'
  | 'CITY_NOT_COVERED'
  | 'DATE_IN_PAST'
  | 'NO_ROUTE'
  | 'ROUTE_DISABLED'
  | 'GATEWAY_FAILED'
  | 'REQUIRES_ACTION';

export type ServicePurchaseResult =
  | { ok: true; ref: string; total: string; paymentId: string }
  | { ok: false; reason: ServicePurchaseFailure; code?: string; actionUrl?: string };

export async function purchaseService(
  input: {
    serviceKey: string;
    userId: string;
    /** المركبة التي تُفحص — ومن غير مالكها لا يطلب لها فحصًا. */
    vehicleId: string;
    city: string;
    /** `null` يعني «أقرب موعد» — والمزوّد يحدّده ضمن مهلته. */
    scheduledAt: string | null;
    method: string;
    returnUrl: string;
    idempotencyKey: string;
  },
  now: Date = new Date(),
): Promise<ServicePurchaseResult> {
  const service = await db.service.findFirst({
    where: { key: input.serviceKey, active: true },
    select: {
      id: true, price: true, slaHours: true,
      adminFeeEnabled: true, adminFee: true, adminFeeMode: true,
      provider: { select: { id: true, cities: true } },
    },
  });
  if (service === null) return { ok: false, reason: 'SERVICE_UNKNOWN' };

  /**
   * **ومن لا يملك المركبة لا يطلب لها فحصًا.** تقرير الفحص يُعلَّق
   * على الإعلان ويقرؤه كل مشترٍ — فطلبُه من غير المالك يُدخل في صفحة
   * بائعٍ تقريرًا لم يطلبه ولم يدفع ثمنه.
   */
  const vehicle = await db.vehicle.findFirst({
    where: { id: input.vehicleId, ownerId: input.userId },
    select: { id: true, listings: { select: { id: true }, take: 1 } },
  });
  if (vehicle === null) return { ok: false, reason: 'VEHICLE_NOT_YOURS' };

  /**
   * **والمدينة تُفحص قبل الدفع لا بعده.** مزوّدٌ لا يغطّي تبوك يعني
   * طلبًا يُرفض بعد حجز المال — والردّ أبطأ من ألّا يُؤخذ أصلًا.
   */
  const cities = service.provider?.cities ?? [];
  if (cities.length > 0 && !cities.includes(input.city)) {
    return { ok: false, reason: 'CITY_NOT_COVERED' };
  }

  if (input.scheduledAt !== null) {
    const at = Date.parse(input.scheduledAt);
    if (!Number.isFinite(at) || at < now.getTime() - 60_000) {
      return { ok: false, reason: 'DATE_IN_PAST' };
    }
  }

  const platform = await db.platformSetting.findUnique({
    where: { id: 'default' },
    select: { vatPct: true },
  });
  /**
   * والقاعدة من `money.ts` — هي نفسها التي تعرضها الشاشة.
   *
   * **ورسمُ المنصّة كان يُضبط ولا يُحصَّل**: `adminFeeEnabled` و`adminFee`
   * لهما محرّرٌ كامل في اللوحة ومفتاحُ تشغيل، **ولا قارئَ في مسار
   * الشراء** — فيُفعّله المشغّل ويُسعّره ولا يدخل ريالٌ منه. ويُحفظ
   * على الطلب لقطةً كما يُحفظ السعر: تغييرُ الرسم لاحقًا لا يمسّ
   * طلبًا قائمًا.
   */
  const money = serviceTotal(service.price, platform?.vatPct ?? DEFAULT_VAT_PCT, {
    mode: service.adminFeeMode,
    amount: service.adminFee,
    enabled: service.adminFeeEnabled,
  });
  const total = money.total;

  const resolved = await resolveGateway('SERVICE_PURCHASE');
  if (resolved === null) return { ok: false, reason: 'NO_ROUTE' };
  if (!resolved.enabled) return { ok: false, reason: 'ROUTE_DISABLED' };

  /**
   * ═══ المرجع أوّلًا، ثم المال، ثم الصفّ ═══
   *
   * المرجع يُحجز في معاملة فلا يتصادم، والمال يتحرّك بعده — فلو فشلت
   * البوابة لم يبقَ طلبُ خدمةٍ مدفوعُه غائب. **والعكس يُنتج طلبًا في
   * طابور المزوّد لم يُدفع ثمنه**، ويذهب الفاحص إلى موعدٍ بلا مقابل.
   */
  const ref = await db.$transaction((tx) => nextServiceRequestRef(tx, now));

  const payment = await db.payment.create({
    data: {
      purpose: 'SERVICE_PURCHASE',
      // **لقطة لا إعداد**: ما حُجز هنا يُسوّى من حيث حُجز
      gatewayKey: resolved.gatewayKey,
      environment: resolved.environment,
      amount: total,
      method: input.method,
      status: 'CREATED',
      createdAt: now,
    },
  });

  const held = await resolved.gateway.hold({
    purpose: 'SERVICE_PURCHASE',
    ref,
    amount: total.toString(),
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
    return { ok: false, reason: 'REQUIRES_ACTION', actionUrl: held.actionUrl };
  }

  await db.payment.update({
    where: { id: payment.id },
    data: { status: 'HELD', heldAt: now, holdRef: held.holdRef },
  });

  /**
   * **والمهلة تُحسب عند الإنشاء لا عند العرض.** تغييرُ التزام المزوّد
   * لاحقًا لا يُحرّك مهلة طلبٍ قائم — ومن دفع على وعدٍ يُوفى له به.
   *
   * ═══ والموعدُ غيرُ المهلة ═══
   *
   * كانت `dueAt` تُكتب **بالموعد نفسه** متى اختاره الطالب، فيختلط
   * اثنان لا يلتقيان: `dueAt` التزامُ **المزوّد** («٤٨ ساعة»)،
   * و`scheduledAt` اختيارُ **العميل**. وشاشةُ المهل والمتأخّرات تقرأ
   * الأولى، فكانت تُحاسب المزوّد على موعدٍ لم يَعِد به — ومن اختار
   * موعدًا بعد أسبوع جعل طلبَه «متأخّرًا» بعد ٤٨ ساعة أو «مبكّرًا»
   * أسبوعًا، بحسب الاتّجاه.
   *
   * فالمهلة تجري **من الموعد** متى وُجد: الفاحص يحضر الاثنين، وله
   * بعده ما التزم به ليُصدر تقريره.
   */
  const from = input.scheduledAt === null ? now : new Date(input.scheduledAt);
  const dueAt = new Date(from.getTime() + (service.slaHours ?? 48) * 3_600_000);

  await db.serviceRequest.create({
    data: {
      ref,
      serviceId: service.id,
      userId: input.userId,
      vehicleId: vehicle.id,
      ...(vehicle.listings[0] === undefined ? {} : { listingId: vehicle.listings[0].id }),
      ...(service.provider === null ? {} : { providerId: service.provider.id }),
      status: 'NEW',
      amount: total,
      adminFee: money.platformFee,
      dueAt,
      /**
       * **وما سألناه عنه يُحفظ.** الاستمارة تسأل عن المدينة والموعد
       * وترسلهما، وكانت المدينة تُفحص مقابل التغطية **ثمّ تُرمى** —
       * فيُرسَل الفاحص إلى طلبٍ بلا موضع، ويفتح العميل «تقاريري» فلا
       * يجد موعده الذي اختاره.
       */
      ...(input.scheduledAt === null ? {} : { scheduledAt: new Date(input.scheduledAt) }),
      city: input.city,
      createdAt: now,
    },
  });

  return { ok: true, ref, total: total.toString(), paymentId: payment.id };
}

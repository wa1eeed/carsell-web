import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { purchaseService } from '@/lib/domain/service-purchase';
import { serviceTotal } from '@/lib/domain/money';

/**
 * ═══ شراء خدمة ═══
 *
 * العطل الذي وُلد منه هذا الملف: **لا شيء يُنشئ `ServiceRequest` إلّا
 * البذرة.** تسع خدماتٍ تُعرض، وصفحةُ تفصيلٍ بسعرٍ وضريبةٍ ومهلة،
 * وطابورٌ كامل في اللوحة بإسنادٍ جماعيّ — وصفحة الخدمة تقول «تُطلب من
 * صفحة المركبة»، وصفحةُ المركبة لا زرّ فيها.
 *
 * **دائرةٌ مغلقة بلا مدخل** — وخطُّ إيرادٍ كامل لا يدخله ريال.
 */

const created: string[] = [];
const payments: string[] = [];

beforeAll(async () => {
  /** الشراء يحتاج مسارًا فعّالًا — والوضع التجريبيّ يوجّهه إلى الرملي. */
  const sandbox = await db.paymentGateway.findFirst({ where: { key: 'sandbox' } });
  if (sandbox !== null) {
    await db.paymentRoute.upsert({
      where: { purpose: 'SERVICE_PURCHASE' },
      create: {
        purpose: 'SERVICE_PURCHASE',
        gatewayKey: 'sandbox',
        environment: 'TEST',
        enabled: true,
        updatedBy: 'test',
      },
      update: { gatewayKey: 'sandbox', enabled: true },
    });
  }
});

afterAll(async () => {
  /** الاختبار يعيد ما صنعه — وصفٌّ يبقى يُضخّم كل عدّاد خدمات. */
  await db.serviceRequest.deleteMany({ where: { ref: { in: created } } });
  await db.payment.deleteMany({ where: { id: { in: payments } } });
  await db.$disconnect();
});

/**
 * **والمدينة من تغطية المزوّد لا من مدينة المركبة.** الموقع هو موضع
 * الفحص، والمزوّد يغطّي أربعًا — فمركبةٌ في أبها تُفحص في الرياض.
 * (وأوّل صياغةٍ للاختبار أخذت مدينة المركبة فسقط بـ`CITY_NOT_COVERED`
 * — وهو الحارس يعمل، لا عطلٌ فيه.)
 */
async function ownedVehicle(): Promise<{ userId: string; vehicleId: string; city: string }> {
  const vehicle = await db.vehicle.findFirstOrThrow({
    where: { ownerId: { not: undefined } },
    select: { id: true, ownerId: true, city: true },
  });

  const service = await db.service.findFirstOrThrow({
    where: { key: 'inspection' },
    select: { provider: { select: { cities: true } } },
  });
  const covered = service.provider?.cities ?? [];

  return {
    userId: vehicle.ownerId,
    vehicleId: vehicle.id,
    city: covered[0] ?? vehicle.city,
  };
}

const base = {
  serviceKey: 'inspection',
  scheduledAt: null,
  method: 'mada',
  returnUrl: 'http://localhost/ar',
};

describe('من يطلب الخدمة', () => {
  /**
   * **ومن لا يملك المركبة لا يطلب لها فحصًا.** التقرير يُعلَّق على
   * الإعلان ويقرؤه كل مشترٍ — فطلبُه من غريبٍ يُدخل في صفحة بائعٍ
   * تقريرًا لم يطلبه ولم يدفع ثمنه.
   */
  it('غير المالك يُرفض', async () => {
    const { vehicleId, city } = await ownedVehicle();
    const stranger = await db.user.findFirstOrThrow({
      where: { vehicles: { none: { id: vehicleId } } },
      select: { id: true },
    });

    expect(
      await purchaseService({ ...base, vehicleId, city, userId: stranger.id, idempotencyKey: 'x1' }),
    ).toEqual({ ok: false, reason: 'VEHICLE_NOT_YOURS' });
  });

  /** خدمةٌ غير موجودة تُرفض باسمها — لا تسقط بخطأٍ غامض. */
  it('خدمة مجهولة تُرفض', async () => {
    const { userId, vehicleId, city } = await ownedVehicle();
    expect(
      await purchaseService({
        ...base, serviceKey: 'nope', vehicleId, city, userId, idempotencyKey: 'x2',
      }),
    ).toEqual({ ok: false, reason: 'SERVICE_UNKNOWN' });
  });

  /**
   * **والمدينة تُفحص قبل الدفع لا بعده.** مزوّدٌ لا يغطّيها يعني
   * طلبًا يُرفض بعد حجز المال — والردّ أبطأ من ألّا يُؤخذ أصلًا.
   */
  it('مدينة خارج التغطية تُرفض قبل أن يُحجز شيء', async () => {
    const { userId, vehicleId } = await ownedVehicle();
    const before = await db.payment.count({ where: { purpose: 'SERVICE_PURCHASE' } });

    expect(
      await purchaseService({
        ...base, vehicleId, city: 'مدينةٌ لا وجود لها', userId, idempotencyKey: 'x3',
      }),
    ).toEqual({ ok: false, reason: 'CITY_NOT_COVERED' });

    expect(await db.payment.count({ where: { purpose: 'SERVICE_PURCHASE' } })).toBe(before);
  });

  it('موعدٌ مضى يُرفض', async () => {
    const { userId, vehicleId, city } = await ownedVehicle();
    expect(
      await purchaseService({
        ...base, vehicleId, city, userId, idempotencyKey: 'x4',
        scheduledAt: new Date(Date.now() - 86_400_000).toISOString(),
      }),
    ).toEqual({ ok: false, reason: 'DATE_IN_PAST' });
  });
});

describe('الشراء يقع', () => {
  it('ينشئ الطلب ويحجز المبلغ بالقاعدة التي تعرضها الشاشة', async () => {
    const { userId, vehicleId, city } = await ownedVehicle();

    const result = await purchaseService({
      ...base, vehicleId, city, userId, idempotencyKey: `ok-${String(Date.now())}`,
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    created.push(result.ref);
    payments.push(result.paymentId);

    const row = await db.serviceRequest.findUniqueOrThrow({ where: { ref: result.ref } });
    expect(row.status).toBe('NEW');
    expect(row.vehicleId).toBe(vehicleId);
    /** المهلة تُحسب عند الإنشاء — فتغييرُ التزام المزوّد لا يحرّك طلبًا قائمًا. */
    expect(row.dueAt).not.toBeNull();

    /**
     * **والمبلغ هو ما تعرضه الشاشة.** القاعدة في `money.ts` وحدها،
     * وحسابٌ في كل موضعٍ يُنتج قاعدتين تتباعدان — فيدفع الطالب غير ما
     * رأى.
     */
    const service = await db.service.findFirstOrThrow({ where: { key: 'inspection' } });
    const platform = await db.platformSetting.findUnique({ where: { id: 'default' } });
    const expected = serviceTotal(service.price, platform?.vatPct ?? 15);
    expect(Number(row.amount)).toBe(Number(expected.total));

    const payment = await db.payment.findUniqueOrThrow({ where: { id: result.paymentId } });
    expect(payment.status).toBe('HELD');
    expect(Number(payment.amount)).toBe(Number(expected.total));
    /** **لقطة لا إعداد**: ما حُجز هنا يُسوّى من حيث حُجز. */
    expect(payment.gatewayKey).not.toBe('');
  });
});

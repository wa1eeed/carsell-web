import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  EXPIRY_ALERT_HOURS,
  choicesFor,
  expiringHolds,
  listRoutes,
  requestRouteSwitch,
  setRouteEnabled,
} from '@/lib/domain/payment-routing';

afterAll(async () => {
  await db.$disconnect();
});

let seq = 0;
async function admin() {
  seq += 1;
  return db.adminUser.create({
    data: {
      email: `rte${String(Date.now()).slice(-8)}${String(seq)}@carsell.one`,
      name: 'مشغّل الدفع', role: 'SUPER_ADMIN', passwordHash: 'x',
    },
  });
}

describe('═══ القاعدة ٢ ═══ الناقصة قدرةً لا تظهر، والقصيرة مدّةً تُحذّر', () => {
  it('الضمان: البوابات الثلاث تظهر، والمصرفية وحدها بلا تحذير', async () => {
    const choices = await choicesFor('VEHICLE_ESCROW');
    const keys = choices.map((choice) => choice.key);
    expect(keys).toContain('bank_escrow');

    const bank = choices.find((choice) => choice.key === 'bank_escrow');
    expect(bank?.warning).toBeNull();

    // ═══ ميسر (٧) وتاب (٦) دون الثلاثين — تظهران بتحذير لا تُخفيان ═══
    for (const key of ['moyasar', 'tap']) {
      const choice = choices.find((entry) => entry.key === key);
      expect(choice, key).toBeDefined();
      expect(choice?.warning, key).not.toBeNull();
      expect(choice?.warning, key).toContain('يغيّر معنى الضمان للمشتري');
    }
  });

  it('بوابة بلا تسوية جزئية تختفي من قائمة الضمان', async () => {
    await db.paymentGateway.create({
      data: {
        key: 'no_partial', nameAr: 'بلا إفراج جزئي', nameEn: 'No partial',
        status: 'ACTIVE', sort: 9,
        capabilities: {
          supportsHold: true, supportsPartialSettle: false, supportsRefund: true,
          maxHoldDays: 60, settlementDelayHours: 0, feePct: 1, feeFixed: 0,
        },
      },
    });

    const escrow = await choicesFor('VEHICLE_ESCROW');
    expect(escrow.map((c) => c.key)).not.toContain('no_partial');

    // وتظهر حيث لا تُشترط — العربون يحتاج حجزًا فقط
    const deposit = await choicesFor('AUCTION_DEPOSIT');
    expect(deposit.map((c) => c.key)).toContain('no_partial');

    await db.paymentGateway.delete({ where: { key: 'no_partial' } });
  });

  it('والخادم يمنع ما تُخفيه الشاشة — لو أُرسل مباشرةً', async () => {
    const operator = await admin();
    await db.paymentGateway.create({
      data: {
        key: 'no_hold_srv', nameAr: 'بلا حجز', nameEn: 'No hold',
        status: 'ACTIVE', sort: 9,
        capabilities: {
          supportsHold: false, supportsPartialSettle: true, supportsRefund: true,
          maxHoldDays: 0, settlementDelayHours: 0, feePct: 1, feeFixed: 0,
        },
      },
    });

    const result = await requestRouteSwitch(
      operator,
      { purpose: 'VEHICLE_ESCROW', toGatewayKey: 'no_hold_srv', toEnvironment: 'TEST', reason: 'محاولة تجاوز الشاشة' },
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_ELIGIBLE');

    await db.paymentGateway.delete({ where: { key: 'no_hold_srv' } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });
});

describe('═══ قرار ٣٦ ═══ السبب إلزاميّ', () => {
  it('تبديل بلا سبب يُرفض — والقرار بلا سببه يُعاد نقضه', async () => {
    const operator = await admin();
    const result = await requestRouteSwitch(
      operator,
      { purpose: 'SERVICE_PURCHASE', toGatewayKey: 'moyasar', toEnvironment: 'TEST', reason: 'x' },
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('REASON_REQUIRED');

    expect(await db.approvalRequest.count({ where: { kind: 'PAYMENT_ROUTE' } })).toBe(0);
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('وبسبب مكتوب يُسجَّل طلبٌ بعضوين ولا يُنفَّذ فورًا', async () => {
    const operator = await admin();
    const before = await db.paymentRoute.findUniqueOrThrow({ where: { purpose: 'SERVICE_PURCHASE' } });

    const result = await requestRouteSwitch(
      operator,
      {
        purpose: 'SERVICE_PURCHASE', toGatewayKey: 'moyasar', toEnvironment: 'TEST',
        reason: 'ارتفاع رسوم تاب بعد تجديد العقد',
      },
      null,
    );
    expect(result.ok).toBe(true);

    const request = await db.approvalRequest.findFirstOrThrow({ where: { kind: 'PAYMENT_ROUTE' } });
    expect(request.requiredApprovals).toBe(2);
    expect(request.approvedBy).toEqual([]);
    expect((request.payload as { reason?: string }).reason).toBe('ارتفاع رسوم تاب بعد تجديد العقد');

    // والتوجيه لم يتغيّر — الطلب وحده ليس تبديلًا
    const after = await db.paymentRoute.findUniqueOrThrow({ where: { purpose: 'SERVICE_PURCHASE' } });
    expect(after.gatewayKey).toBe(before.gatewayKey);

    await db.approvalRequest.deleteMany({ where: { kind: 'PAYMENT_ROUTE' } });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });
});

describe('═══ القاعدة ٣ ═══ غرضٌ له معاملات جارية لا يُعطَّل', () => {
  it('التعطيل يُرفض ما دام هناك حجز قائم', async () => {
    const operator = await admin();
    const order = await db.order.findFirstOrThrow();

    const payment = await db.payment.create({
      data: {
        orderId: order.id, purpose: 'VEHICLE_ESCROW', gatewayKey: 'bank_escrow',
        amount: 1000, method: 'mada', status: 'HELD', heldAt: new Date(),
      },
    });

    const blocked = await setRouteEnabled(operator, 'VEHICLE_ESCROW', false, null);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('HAS_IN_FLIGHT');

    // وبعد انتهائه يُعطَّل
    await db.payment.update({ where: { id: payment.id }, data: { status: 'SETTLED' } });
    const allowed = await setRouteEnabled(operator, 'VEHICLE_ESCROW', false, null);
    expect(allowed.ok).toBe(true);

    await setRouteEnabled(operator, 'VEHICLE_ESCROW', true, null);
    await db.payment.delete({ where: { id: payment.id } });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });
});

describe('تنبيه الحجز المقترب من الانقضاء', () => {
  it('ينبّه قبل ٤٨ ساعة، ويصمت قبلها، ولا يسكت عن المنقضي', async () => {
    const order = await db.order.findFirstOrThrow();
    const now = new Date();
    // المصرفية: ٣٠ يومًا
    const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000);

    const [fresh, soon, expired] = await Promise.all([
      db.payment.create({ data: { orderId: order.id, purpose: 'VEHICLE_ESCROW', gatewayKey: 'bank_escrow', amount: 100, method: 'mada', status: 'HELD', heldAt: at(2) } }),
      db.payment.create({ data: { orderId: order.id, purpose: 'VEHICLE_ESCROW', gatewayKey: 'bank_escrow', amount: 200, method: 'mada', status: 'HELD', heldAt: at(29) } }),
      db.payment.create({ data: { orderId: order.id, purpose: 'VEHICLE_ESCROW', gatewayKey: 'bank_escrow', amount: 300, method: 'mada', status: 'HELD', heldAt: at(31) } }),
    ]);

    const alerts = await expiringHolds(now);
    const ids = alerts.map((row) => row.paymentId);

    expect(ids).not.toContain(fresh.id);
    expect(ids).toContain(soon.id);
    // المنقضي فعلًا يبقى: السكوت عنه بعد فواته أسوأ من التنبيه قبله
    expect(ids).toContain(expired.id);

    const expiredRow = alerts.find((row) => row.paymentId === expired.id);
    expect(expiredRow?.hoursLeft).toBeLessThan(0);
    expect(EXPIRY_ALERT_HOURS).toBe(48);

    // والمدّة من قدرات بوابة المعاملة نفسها لا من الإعداد الجاري
    const soonRow = alerts.find((row) => row.paymentId === soon.id);
    expect(soonRow?.gatewayKey).toBe('bank_escrow');

    await db.payment.deleteMany({ where: { id: { in: [fresh.id, soon.id, expired.id] } } });
  });
});

describe('حجم الشهر عمودان', () => {
  it('مُسوّى هذا الشهر ومحجوز الآن — كلاهما من دفترنا', async () => {
    const order = await db.order.findFirstOrThrow();
    const now = new Date();

    const [held, settled] = await Promise.all([
      db.payment.create({ data: { orderId: order.id, purpose: 'AUCTION_DEPOSIT', gatewayKey: 'bank_escrow', amount: 5000, method: 'mada', status: 'HELD', heldAt: now } }),
      db.payment.create({ data: { orderId: order.id, purpose: 'AUCTION_DEPOSIT', gatewayKey: 'bank_escrow', amount: 7000, method: 'mada', status: 'SETTLED', settledAmount: 7000, settledAt: now } }),
    ]);

    const routes = await listRoutes(now);
    const deposit = routes.find((row) => row.purpose === 'AUCTION_DEPOSIT');

    // العمودان لا يخلطان: المحجوز ليس مُسوّى والعكس
    expect(Number(deposit?.heldNow)).toBe(5000);
    expect(Number(deposit?.settledThisMonth)).toBe(7000);
    expect(deposit?.inFlight).toBe(1);

    await db.payment.deleteMany({ where: { id: { in: [held.id, settled.id] } } });
  });

  it('كل غرض له صفّ ولو بلا توجيه', async () => {
    const routes = await listRoutes();
    expect(routes).toHaveLength(6);
    expect(routes.find((row) => row.purpose === 'SUBSCRIPTION')?.enabled).toBe(false);
  });
});

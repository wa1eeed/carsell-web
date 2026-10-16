import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  decideServiceRequest,
  payServiceRequest,
  requestService,
} from '@/lib/domain/service-lifecycle';
import { applyStep } from '@/lib/domain/provider-queue';

/**
 * ═══ الرحلة كاملةً — طلبٌ فإذنٌ فدفعٌ فإنجاز ═══
 *
 * **والرحلة تُمشى إلى آخرها لا إلى أوّل نجاح.** لكلِّ خطوةٍ اختبارُها،
 * وما لا يُقاس هو **التقاؤها**: أيصل المال إلى الدفتر؟ أتخرج الفاتورة؟
 * أيُخطَر من دفع؟ وكلُّ واحدةٍ منها بُنيت في يومٍ غير يوم أختها.
 *
 * وهي تمرّ بالبوّابة التجريبية — فالتوجيه إليها شرطُ المشي، والاختبار
 * يفرضه على نفسه ثمّ يعيد ما غيّره.
 */

const refs: string[] = [];
let restoreRoute: { gatewayKey: string; environment: 'TEST' | 'LIVE' } | null = null;

afterEach(async () => {
  for (const ref of refs) {
    const request = await db.serviceRequest.findUnique({
      where: { ref },
      select: { id: true, paymentId: true },
    });
    if (request === null) continue;

    await db.taxInvoiceLine.deleteMany({ where: { invoice: { serviceRequestId: request.id } } });
    await db.taxInvoice.deleteMany({ where: { serviceRequestId: request.id } });

    /** **والقيد يُحذف بمعاملته** — وإلّا بقي طرفٌ يتيم يُسقط فحص التوازن. */
    const rows = await db.ledgerEntry.findMany({
      where: { note: ref },
      select: { txnId: true },
    });
    const txns = [...new Set(rows.map((row) => row.txnId))];
    if (txns.length > 0) await db.ledgerEntry.deleteMany({ where: { txnId: { in: txns } } });

    await db.notification.deleteMany({ where: { entityType: 'ServiceRequest', entityId: ref } });
    await db.serviceRequest.delete({ where: { id: request.id } });
    if (request.paymentId !== null) {
      await db.payment.delete({ where: { id: request.paymentId } }).catch(() => undefined);
    }
  }
  refs.length = 0;

  if (restoreRoute !== null) {
    await db.paymentRoute.update({
      where: { purpose: 'SERVICE_PURCHASE' },
      data: restoreRoute,
    });
    restoreRoute = null;
  }
});

afterAll(async () => {
  await db.$disconnect();
});

/** يوجّه شراء الخدمات إلى البوّابة التجريبية، ويحفظ ما كان ليُعاد. */
async function throughSandbox(): Promise<void> {
  const route = await db.paymentRoute.findUniqueOrThrow({
    where: { purpose: 'SERVICE_PURCHASE' },
    select: { gatewayKey: true, environment: true },
  });
  restoreRoute = route;
  await db.paymentRoute.update({
    where: { purpose: 'SERVICE_PURCHASE' },
    data: { gatewayKey: 'sandbox', environment: 'TEST', enabled: true },
  });
}

describe('رحلةُ فحصٍ يطلبه مشترٍ', () => {
  it('تمشي إلى آخرها: الدفتر والفاتورة والإخطارات', async () => {
    await throughSandbox();

    const provider = await db.serviceProvider.findFirstOrThrow({
      where: { type: 'INSPECTION', active: true, accountStatus: { in: ['ACTIVE', 'SEMI_ACTIVE'] } },
      select: { id: true, cities: true },
    });
    const city = provider.cities[0] ?? 'الرياض';
    const listing = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED', city },
      select: { ref: true, vehicleId: true, sellerId: true },
    });
    const buyer = await db.user.findFirstOrThrow({
      where: { id: { not: listing.sellerId }, role: 'USER' },
      select: { id: true },
    });
    const service = await db.service.findFirstOrThrow({
      where: { providerType: 'INSPECTION', active: true },
      select: { key: true },
    });

    // ١ ─ يطلب المشتري فحصًا لمركبةٍ ليست له
    const asked = await requestService({
      serviceKey: service.key,
      requesterId: buyer.id,
      vehicleId: listing.vehicleId,
      scheduledAt: null,
    });
    expect(asked.ok, JSON.stringify(asked)).toBe(true);
    if (!asked.ok) return;
    refs.push(asked.ref);

    /** **ولا مال قبل الإذن** — الطلب ينتظر صاحب المركبة. */
    expect(
      (await db.serviceRequest.findUniqueOrThrow({
        where: { ref: asked.ref },
        select: { status: true },
      })).status,
    ).toBe('AWAITING_SELLER');

    // ٢ ─ يأذن البائع
    const decided = await decideServiceRequest({
      ref: asked.ref,
      sellerId: listing.sellerId,
      accept: true,
      reason: null,
    });
    expect(decided.ok, JSON.stringify(decided)).toBe(true);

    // ٣ ─ يدفع الطالب
    const paid = await payServiceRequest({
      ref: asked.ref,
      requesterId: buyer.id,
      method: 'mada',
      returnUrl: 'http://localhost/ar/account/reports',
      idempotencyKey: `journey-${asked.ref}`,
    });
    expect(paid.ok, JSON.stringify(paid)).toBe(true);

    const afterPay = await db.serviceRequest.findUniqueOrThrow({
      where: { ref: asked.ref },
      select: { status: true, paymentId: true, amount: true, adminFee: true, vatAmount: true },
    });
    /** **ودُفع يعني «في طابور المزوّدين»** — وهو معنى `NEW`. */
    expect(afterPay.status).toBe('NEW');
    expect(afterPay.paymentId).not.toBeNull();
    /** والضريبة لقطةٌ على الطلب لا تُشتقّ لاحقًا. */
    expect(Number(afterPay.vatAmount)).toBeGreaterThan(0);

    const held = await db.ledgerEntry.findMany({
      where: { note: asked.ref },
      select: { account: true, direction: true, event: true },
    });
    expect(held.map((row) => row.event)).toEqual(['service.paid', 'service.paid']);
    /** **قبضٌ لا إيراد** — الخدمة لم تقع بعد. */
    expect(held.some((row) => row.account === 'PLATFORM_REVENUE')).toBe(false);

    // ٤ ─ يقبل المزوّد ويبدأ ويُنجز
    for (const step of ['accept', 'start', 'complete'] as const) {
      const result = await applyStep({ ref: asked.ref, providerId: provider.id, step, reason: null });
      expect(result.ok, `${step}: ${JSON.stringify(result)}`).toBe(true);
    }

    // ٥ ─ الدفتر يعترف بالإيراد ويُنشئ دَين المزوّد
    const booked = await db.ledgerEntry.findMany({
      where: { note: asked.ref },
      select: { account: true, direction: true, amount: true, event: true },
    });
    const events = new Set(booked.map((row) => row.event));
    expect(events).toEqual(new Set(['service.paid', 'service.earned', 'service.provider_due']));

    const revenue = booked.find((row) => row.account === 'PLATFORM_REVENUE');
    const providerDue = booked.find((row) => row.account === 'PROVIDER_PAYABLE');
    expect(revenue?.amount.toString()).toBe(
      afterPay.amount.minus(afterPay.vatAmount).toString(),
    );
    expect(providerDue?.amount.toString()).toBe(
      afterPay.amount.minus(afterPay.vatAmount).minus(afterPay.adminFee).toString(),
    );

    // ٦ ─ والفاتورة خرجت لمن دفع
    const request = await db.serviceRequest.findUniqueOrThrow({
      where: { ref: asked.ref },
      select: { id: true },
    });
    const invoice = await db.taxInvoice.findUnique({
      where: { serviceRequestId: request.id },
      select: { number: true, total: true, ruleSupplyType: true },
    });
    expect(invoice?.ruleSupplyType).toBe('SERVICE');
    expect(invoice?.total.toString()).toBe(afterPay.amount.toString());

    // ٧ ─ وكلُّ طرفٍ أُخطر بما يعنيه
    const bells = await db.notification.findMany({
      where: { entityType: 'ServiceRequest', entityId: asked.ref },
      select: { templateKey: true, userId: true },
    });
    const keys = bells.map((row) => row.templateKey);
    expect(keys).toContain('service.consent_needed');
    expect(keys).toContain('service.consent_granted');
    expect(keys).toContain('service.assigned');
    expect(keys).toContain('service.completed');
    /** **والإذن يُطلب من صاحب المركبة، وما بعده يصل من دفع.** */
    expect(
      bells.find((row) => row.templateKey === 'service.consent_needed')?.userId,
    ).toBe(listing.sellerId);
    expect(bells.find((row) => row.templateKey === 'service.completed')?.userId).toBe(buyer.id);
  });
});

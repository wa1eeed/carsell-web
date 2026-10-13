import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { startHold } from '@/lib/domain/payments';
import {
  ORDER_GROUPS,
  isClosedOrder,
  isLiveOrder,
  orderGroup,
  orderNeedsBuyer,
} from '@/lib/domain/order-state';
import { withOrder } from './helpers/order-fixture';

/**
 * ═══ طلبٌ ملغى لا يُدفع — والمرحلة لا تحكم ═══
 *
 * الإلغاء حالةٌ لا مرحلة (قرار المصمّم ١٧): الطلب يبقى عند المرحلة
 * التي مات فيها. فطلبٌ أُلغي في `PAYMENT` **مرحلتُه `PAYMENT` إلى
 * الأبد**، وكلُّ حارسٍ يقرأ المرحلة وحدها يمرّ عليه.
 *
 * و`startHold` كان يختار `status` في استعلامه **ولا يقرؤه** — فحجزٌ
 * ينجح على طلبٍ ميّت أُعيد إعلانُه معروضًا، فيُؤخذ مالٌ مرّتين عن
 * مركبةٍ واحدة. و`advanceStage` كان يفحصها منذ بُني، فمدخلٌ واحدٌ من
 * اثنين كان مكشوفًا.
 */
describe('الدفع يُرفض على طلبٍ غير حيّ', () => {
  for (const status of ['CANCELLED', 'COMPLETED', 'STALLED', 'DISPUTED'] as const) {
    it(`${status} في مرحلة الدفع ⇒ ORDER_CLOSED`, async () => {
      await withOrder(async (order) => {
        await db.order.update({
          where: { id: order.id },
          data: { stage: 'PAYMENT', status, paymentDueAt: new Date(Date.now() + 86_400_000) },
        });
        /** ولا حجزَ قائمًا ولا محاولةَ طائرة — فلا يُرفض بسببٍ آخر */
        await db.payment.deleteMany({ where: { orderId: order.id } });

        const result = await startHold({
          orderRef: order.ref,
          buyerId: order.buyerId,
          method: 'card',
          returnUrl: 'https://example.test/return',
          idempotencyKey: `closed-${status}-${order.ref}`,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('ORDER_CLOSED');
      });
    });
  }

  /** والحيُّ لا يُرفض بهذا السبب — وإلّا كان الحارس يمنع الجميع. */
  it('و`ACTIVE` لا يُرفض بـORDER_CLOSED', async () => {
    await withOrder(async (order) => {
      await db.order.update({
        where: { id: order.id },
        data: { stage: 'PAYMENT', status: 'ACTIVE', paymentDueAt: new Date(Date.now() + 86_400_000) },
      });
      await db.payment.deleteMany({ where: { orderId: order.id } });

      const result = await startHold({
        orderRef: order.ref,
        buyerId: order.buyerId,
        method: 'card',
        returnUrl: 'https://example.test/return',
        idempotencyKey: `open-${order.ref}`,
      });

      /**
       * قد يُرفض لغياب بوابةٍ مُعدَّة — وهو حالُ بيئة الاختبار
       * (`bank_escrow` بلا مُهايئ). المقصود أن **السبب ليس الحالة**.
       */
      if (!result.ok) expect(result.reason).not.toBe('ORDER_CLOSED');
    });
  });
});

describe('والمحكّ يُقرأ من موضعٍ واحد', () => {
  it('`isLiveOrder` على الحالات الخمس', () => {
    expect(isLiveOrder('ACTIVE')).toBe(true);
    for (const status of ['CANCELLED', 'COMPLETED', 'STALLED', 'DISPUTED']) {
      expect(isLiveOrder(status)).toBe(false);
    }
  });

  /**
   * **والبنر يقرأ الحالة والمرحلة معًا.** كان يقرأ المرحلة وحدها،
   * فيقول «طلبٌ ينتظر الدفع» بلونٍ أخضر عن طلبٍ أُلغي.
   */
  it('و`orderNeedsBuyer` لا يبلغه ملغًى في مرحلة الدفع', () => {
    expect(orderNeedsBuyer('ACTIVE', 'PAYMENT')).toBe(true);
    expect(orderNeedsBuyer('ACTIVE', 'TRANSFER')).toBe(true);
    expect(orderNeedsBuyer('ACTIVE', 'REQUEST')).toBe(false);
    expect(orderNeedsBuyer('CANCELLED', 'PAYMENT')).toBe(false);
    expect(orderNeedsBuyer('CANCELLED', 'TRANSFER')).toBe(false);
    expect(orderNeedsBuyer('COMPLETED', 'TRANSFER')).toBe(false);
  });
});

describe('تجميع «طلباتي» الثلاثة', () => {
  /** والمتوقّف والمتنازَع عليه قيدَ إجراء: لهما مسارٌ يُستأنف. */
  it('كل حالةٍ تقع في مجموعةٍ واحدة', () => {
    expect(orderGroup('ACTIVE')).toBe('live');
    expect(orderGroup('STALLED')).toBe('live');
    expect(orderGroup('DISPUTED')).toBe('live');
    expect(orderGroup('COMPLETED')).toBe('done');
    expect(orderGroup('CANCELLED')).toBe('cancelled');
  });

  /**
   * **وكلُّ قيمةٍ في التعداد لها مجموعة.** حالٌ سادسة تُضاف إلى
   * `OrderStatus` ولا تُصنَّف تسقط في «قيد الإجراء» صامتةً — وهذا
   * الفحص يجعل الإضافة قرارًا لا سهوًا.
   */
  it('ولا حالةَ مخطّطٍ بلا مجموعة', async () => {
    const { readFileSync } = await import('node:fs');
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const block = schema.slice(schema.indexOf('enum OrderStatus {'));
    const values = block
      .slice(0, block.indexOf('}'))
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[A-Z_]+$/.test(line));

    expect(values).toHaveLength(5);
    for (const value of values) {
      expect(ORDER_GROUPS).toContain(orderGroup(value));
    }
  });

  /**
   * ═══ والعدد من التصنيف نفسه الذي يُرشَّح به ═══
   *
   * شرطان يتباعدان يقولان «قيد الإجراء (٣)» ويعرضان اثنين — والبوابة
   * ٤٠ وُلدت من هذا بعينه في تبويبات اللوحة.
   */
  it('وعددُ كل مجموعةٍ يساوي طولَ ما يعرضه ترشيحُها', async () => {
    const { db } = await import('@/lib/db');
    const orders = await db.order.findMany({ select: { status: true }, take: 50 });

    for (const group of ORDER_GROUPS) {
      const filtered = orders.filter((order) => orderGroup(order.status) === group);
      const counted = orders.reduce(
        (total, order) => total + (orderGroup(order.status) === group ? 1 : 0),
        0,
      );
      expect(counted).toBe(filtered.length);
    }

    /** والمجموعات الثلاث تستوعب الكلّ — لا طلبَ يسقط بين تبويبين. */
    const sum = ORDER_GROUPS.reduce(
      (total, group) => total + orders.filter((o) => orderGroup(o.status) === group).length,
      0,
    );
    expect(sum).toBe(orders.length);
  });
});

describe('والمغلَق أضيق من غير الحيّ', () => {
  it('`isClosedOrder` للملغى والمكتمل وحدهما', () => {
    expect(isClosedOrder('CANCELLED')).toBe(true);
    expect(isClosedOrder('COMPLETED')).toBe(true);
    /** لهما مسارٌ — والشاشة لا تُخفي بابًا يفتحه الخادم. */
    expect(isClosedOrder('STALLED')).toBe(false);
    expect(isClosedOrder('DISPUTED')).toBe(false);
    expect(isClosedOrder('ACTIVE')).toBe(false);
  });

  /**
   * **والحدّ هو نفسه الذي يفرضه `openDispute`.** لو ضاقت الشاشة عن
   * الخادم لأخفت عن المتوقّف بابَ نزاعٍ يفتحه له، ولو اتّسعت لعرضت
   * بابًا يُردّ عنه.
   */
  it('ويطابق ما يرفضه `openDispute`', async () => {
    const source = (await import('node:fs')).readFileSync('src/lib/domain/disputes.ts', 'utf8');
    expect(source).toContain("order.status === 'COMPLETED' || order.status === 'CANCELLED'");
  });
});

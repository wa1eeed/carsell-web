import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  approveRouteSwitch,
  requestRouteSwitch,
  routeChanges,
} from '@/lib/domain/payment-routing';

/**
 * ═══ تاريخ تبديل المسار يُكتب ويُقرأ ═══
 *
 * `PaymentRouteChange` جدولٌ كامل — من أين وإلى أين وبأيّ بيئة
 * **وبسببٍ إلزاميّ** — ولم يكن له كاتبٌ ولا قارئ. وسجلُّ التدقيق
 * يحفظ الفعل لا القصّة: من يسأل بعد سنة «لماذا تحوّلنا؟» يحتاج
 * السبب ومن اعتمده.
 */

afterAll(async () => {
  await db.$disconnect();
});

let seq = 0;
async function admin() {
  seq += 1;
  return db.adminUser.create({
    data: {
      email: `rth${String(Date.now()).slice(-8)}${String(seq)}@carsell.one`,
      name: 'ماليّ',
      role: 'FINANCE',
      passwordHash: 'x',
    },
  });
}

describe('═══ التبديل يترك قصّته ═══', () => {
  /**
   * ═══ والتنظيف في `finally` لا في ذيل الجسد ═══
   *
   * أوّلُ تشغيلٍ لهذا الاختبار سقط عند تأكيدٍ في وسطه، **فلم تجرِ
   * سطورُ التنظيف بعده**: بقي `SERVICE_PURCHASE` على بوابةٍ غير
   * بوابته وبقي طلبُ موافقةٍ معلَّق، فسقط اختبارٌ جارٌ في الملفّ
   * المجاور على ما لم يصنعه.
   *
   * والاختبار يعيد ما غيّره **وإن سقط** — وهو أحوج ما يكون إلى ذلك
   * حين يسقط.
   */
  it('يُكتب صفُّ تاريخٍ بسببه ومُوافِقيه، ويُقرأ', async () => {
    const [one, two] = await Promise.all([admin(), admin()]);

    /** غرضٌ لا يمسّ البذرة — ولا حجزَ عليه يمنع التبديل. */
    const purpose = 'SERVICE_PURCHASE' as const;
    const before = await db.paymentRoute.findUniqueOrThrow({ where: { purpose } });
    const reason = 'قياسُ تاريخ التبديل — سببٌ مكتوبٌ كما يفرضه الحارس';

    try {
    const target = await db.paymentGateway.findFirstOrThrow({
      where: { key: { not: before.gatewayKey }, status: { not: 'INACTIVE' } },
      select: { key: true },
    });

    const asked = await requestRouteSwitch(one, {
      purpose,
      toGatewayKey: target.key,
      toEnvironment: before.environment,
      reason,
    }, null);
    expect(asked.ok).toBe(true);

    const request = await db.approvalRequest.findFirstOrThrow({
      where: { kind: 'PAYMENT_ROUTE', entityId: purpose, status: 'PENDING' },
    });

    const applied = await approveRouteSwitch(two, request.id, null);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.state).toBe('APPLIED');

    const history = await routeChanges(5);
    const row = history.find((entry) => entry.purpose === purpose && entry.reason === reason);

    expect(row).toBeDefined();
    expect(row?.fromGatewayKey).toBe(before.gatewayKey);
    expect(row?.toGatewayKey).toBe(target.key);
    /**
     * **والمُوافِقون يُحفظون.** والنصاب عضوان يُحسب فيهما الطالبُ
     * (`approvals.length + 1`)، فالمسجَّل في `approvedBy` واحدٌ
     * غيرُه — والسجلّ يحفظ من اعتمد لا العدد المطلوب.
     */
    expect(row?.approvals).toBe(1);
    expect(row?.toEnvironment).toBe(before.environment);

    } finally {
      await db.paymentRouteChange.deleteMany({ where: { reason } });
      await db.paymentRoute.update({
        where: { purpose },
        data: { gatewayKey: before.gatewayKey, environment: before.environment },
      });
      await db.approvalRequest.deleteMany({
        where: { kind: 'PAYMENT_ROUTE', entityId: purpose },
      });
      await db.auditLog.deleteMany({ where: { actorId: { in: [one.id, two.id] } } });
      await db.adminUser.deleteMany({ where: { id: { in: [one.id, two.id] } } });
    }
  });
});

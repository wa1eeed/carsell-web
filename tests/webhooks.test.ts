import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments } from '../scripts/strip-comments.mjs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { ADMIN_NAV } from '@/components/admin/nav';
import { WebhookOutcome } from '@/generated/prisma/enums';
import {
  BAD_SIGNATURE_CAP,
  WEBHOOK_STATUS,
  adminWebhookEvents,
  closeWebhook,
  countRepeat,
  openWebhook,
  recordBadSignature,
  webhookOutcomeCounts,
  webhooksForPayments,
} from '@/lib/domain/webhooks';
import {
  WEBHOOK_OUTCOME,
  WEBHOOK_OUTCOME_HINT,
  WEBHOOK_OUTCOME_TONE,
} from '@/lib/labels/webhooks';

const ROOT = process.cwd();
const MADE = 'evt_test_';

/** **والاختبار يعيد ما غيّره** — وكلُّ صفٍّ يصنعه يحمل بادئته. */
afterAll(async () => {
  await db.webhookEvent.deleteMany({ where: { id: { startsWith: MADE } } });
});

async function firstPaymentId(): Promise<string> {
  const payment = await db.payment.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  return payment.id;
}

/**
 * ═══ ردُّ البوّابة — وكان يُكتب بلا قارئ ═══
 *
 * سمّته البوابةُ ٦٤ يومَ بُنيت: كلُّ ردٍّ يُخزَّن بحمولته كاملةً ولا
 * شيء يقرؤه. وقياسُ المسار أخرج ثلاثًا أسوأ من غياب الشاشة.
 */
describe('ردود بوابة الدفع تُقرأ', () => {
  it('الوجهة في الملاحة ولها شاشة', () => {
    const entry = ADMIN_NAV.flatMap((group) => group.items).find(
      (item) => item.href === '/admin/webhooks',
    );
    expect(entry).toBeDefined();
    expect(() => readFileSync(join(ROOT, 'src/app/admin/webhooks/page.tsx'))).not.toThrow();
  });

  /**
   * **وكلُّ قيمةِ تعدادٍ لها كاتب.** الصنفُ وقع إحدى عشرة مرّة في
   * هذا المستودع: قيمةٌ في المخطّط لا يكتبها أحد فتبدو حالًا ممكنة
   * وهي بابٌ مسدود. فتُقاس هنا على المصدر لا على الذاكرة.
   */
  it('ولكل نتيجة كاتب في المنتج', () => {
    const sources = [
      'src/app/api/v1/webhooks/payments/route.ts',
      'src/lib/domain/webhooks.ts',
    ]
      .map((path) => readFileSync(join(ROOT, path), 'utf8'))
      .join('\n');

    for (const outcome of Object.values(WebhookOutcome)) {
      expect(sources, `«${outcome}» بلا كاتب`).toContain(`'${outcome}'`);
    }
  });

  it('ولكل نتيجة تسمية وشرح ولون', () => {
    for (const outcome of Object.values(WebhookOutcome)) {
      expect(WEBHOOK_OUTCOME[outcome]).toBeTruthy();
      expect(WEBHOOK_OUTCOME_HINT[outcome]).toBeTruthy();
      expect(WEBHOOK_OUTCOME_TONE[outcome]).toBeTruthy();
    }
  });

  /**
   * **وما لا يُزرع لا يُرى.** الجدولُ كان صفرَ صفوفٍ في التطوير —
   * فالبوّابة التجريبية تؤكّد فورًا بلا استدعاء — وكانت الشاشة
   * ستُشحن حالةً فارغة لا يملؤها أحد. والبذرةُ تزرع الأشكال كلَّها.
   */
  it('والبذرة تزرع كل شكل يكتبه المنتج', async () => {
    const counts = await webhookOutcomeCounts();
    for (const outcome of Object.values(WebhookOutcome)) {
      expect(counts[outcome] ?? 0, `لا صفَّ مزروعًا بـ«${outcome}»`).toBeGreaterThan(0);
    }
  });

  it('والخريطة تقابل أحوال الدفع المعروفة', () => {
    expect(WEBHOOK_STATUS['payment_captured']).toBe('SETTLED');
    expect(WEBHOOK_STATUS['payment_authorized']).toBe('HELD');
    expect(WEBHOOK_STATUS['payment_pending']).toBeUndefined();
  });

  /**
   * ═══ ونتيجةُ `applyState` تُسجَّل ═══
   *
   * كانت تُهمَل: ويبهوكٌ متأخّر يُرفض انتقالُه ويُكتب الصفُّ
   * «معالَجًا» — ولا أثرَ للرفض في مكان.
   */
  it('والصف يُفتح على RECEIVED ثم يُغلق بما ترتب عليه', async () => {
    const paymentId = await firstPaymentId();
    const id = `${MADE}open`;

    expect(
      await openWebhook({
        id,
        provider: 'bank_escrow',
        type: 'payment_captured',
        paymentId,
        payload: { id, type: 'payment_captured', data: { id: 'ref' } },
      }),
    ).toBe(true);

    const opened = await db.webhookEvent.findUniqueOrThrow({ where: { id } });
    expect(opened.outcome).toBe('RECEIVED');
    expect(opened.processedAt).toBeNull();

    await closeWebhook(id, 'REFUSED', null, 'INVALID_TRANSITION');
    const closed = await db.webhookEvent.findUniqueOrThrow({ where: { id } });
    expect(closed.outcome).toBe('REFUSED');
    expect(closed.note).toBe('INVALID_TRANSITION');
    expect(closed.processedAt).not.toBeNull();
  });

  /** **وإعادةُ الإرسال تُعدّ** — كانت تُردّ ٢٠٠ بلا أثر في مكان. */
  it('وإعادة الإرسال تُعدّ على الصف نفسه', async () => {
    const paymentId = await firstPaymentId();
    const id = `${MADE}repeat`;
    const envelope = {
      id,
      provider: 'bank_escrow',
      type: 'payment_paid',
      paymentId,
      payload: { id, type: 'payment_paid', data: { id: 'ref' } },
    };

    expect(await openWebhook(envelope)).toBe(true);
    // الثاني يصطدم بالمفتاح — وهو حارسُ التكرار نفسُه
    expect(await openWebhook(envelope)).toBe(false);

    await countRepeat(id);
    await countRepeat(id);
    const row = await db.webhookEvent.findUniqueOrThrow({ where: { id } });
    expect(row.repeats).toBe(2);
  });

  /**
   * ═══ والمرفوضُ توقيعُه يُسجَّل — محدودًا ═══
   *
   * **ويُختبَر الحدُّ بتجاوزه** لا بوصف البيانات: فحصٌ على حدٍّ لا
   * تبلغه البيانات أخضرُ أعمى مهما كان الحدّ.
   */
  it('والتوقيع الخاطئ يُسجَّل حتى السقف ثم يُكتفى', async () => {
    const payment = await db.payment.create({
      data: {
        purpose: 'VEHICLE_ESCROW',
        gatewayKey: 'bank_escrow',
        amount: '10.00',
        method: 'mada',
        status: 'PENDING',
        holdRef: `${MADE}hold`,
      },
    });

    try {
      for (let n = 0; n < BAD_SIGNATURE_CAP; n += 1) {
        const id = `${MADE}bad_${String(n)}`;
        expect(
          await recordBadSignature({
            id,
            provider: 'bank_escrow',
            type: 'payment_captured',
            paymentId: payment.id,
            payload: { id, data: { id: payment.holdRef } },
          }),
          `رُفض التسجيل قبل السقف عند ${String(n)}`,
        ).toBe(true);
      }

      /** الواحدُ بعد السقف لا يُكتب — فمن يملك مرجعًا لا يملأ الجدول. */
      const over = `${MADE}bad_over`;
      expect(
        await recordBadSignature({
          id: over,
          provider: 'bank_escrow',
          type: 'payment_captured',
          paymentId: payment.id,
          payload: { id: over, data: { id: payment.holdRef } },
        }),
      ).toBe(false);
      expect(await db.webhookEvent.findUnique({ where: { id: over } })).toBeNull();

      const stored = await webhooksForPayments([payment.id]);
      expect(stored).toHaveLength(BAD_SIGNATURE_CAP);
      expect(stored.every((row) => row.signatureOk === false)).toBe(true);
      expect(stored.every((row) => row.outcome === 'BAD_SIGNATURE')).toBe(true);
    } finally {
      await db.webhookEvent.deleteMany({ where: { paymentId: payment.id } });
      await db.payment.delete({ where: { id: payment.id } });
    }
  });

  /** والقراءةُ تصفّي بالنتيجة — وشريطُ الشاشة يُبنى منها. */
  it('والقائمة تُصفّى بالنتيجة', async () => {
    const applied = await adminWebhookEvents({ outcome: 'APPLIED' });
    expect(applied.length).toBeGreaterThan(0);
    expect(applied.every((row) => row.outcome === 'APPLIED')).toBe(true);

    const refused = await adminWebhookEvents({ outcome: 'REFUSED' });
    expect(refused.every((row) => row.outcome === 'REFUSED')).toBe(true);
    expect(refused.some((row) => row.note === 'INVALID_TRANSITION')).toBe(true);
  });

  /** **والباب عند موضع الحاجة**: ردودُ دفعةٍ بعينها، لا الجدول كلُّه. */
  it('وردود دفعة بعينها لا غيرها', async () => {
    const row = await db.webhookEvent.findFirstOrThrow({
      where: { paymentId: { not: null } },
    });
    const forPayment = await webhooksForPayments([row.paymentId as string]);
    expect(forPayment.length).toBeGreaterThan(0);
    expect(forPayment.every((entry) => entry.paymentId === row.paymentId)).toBe(true);
    expect(await webhooksForPayments([])).toEqual([]);
  });

  /**
   * **والمسار يسجّل قبل أن يردّ ٤٠١.** كان يردّ ثمّ لا يكتب، فعمودُ
   * `signatureOk` لم يحمل `false` قطّ. والفحصُ على ترتيب المصدر.
   */
  it('والمسار يسجل التوقيع الخاطئ قبل أن يرد', () => {
    /**
     * **والفحصُ يقرأ الشيفرة لا التعليق.** قِيس هذا الاختبار بتعطيل
     * السطر الذي يحرسه فبقي أخضر: السطرُ المعطَّل يبقى نصًّا، وهو
     * الشكلُ الذي خدع البوابات ٥٠ و٥٢ و١٩ — سكوتٌ لا إنذار.
     */
    const route = stripComments(
      readFileSync(join(ROOT, 'src/app/api/v1/webhooks/payments/route.ts'), 'utf8'),
    );
    const record = route.indexOf('recordBadSignature(envelope)');
    const deny = route.indexOf("'invalid signature'");
    expect(record).toBeGreaterThan(-1);
    expect(record).toBeLessThan(deny);
  });
});

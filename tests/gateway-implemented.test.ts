import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { IMPLEMENTED_GATEWAYS, gatewayImplemented, resolveForPayment } from '@/lib/payments/resolve';

/**
 * ═══ «مربوطة» ليست «تُحصّل» ═══
 *
 * `PaymentGateway.status = ACTIVE` صفٌّ في القاعدة، والمُهايئ شيفرة.
 * وكانت في القاعدة **أربع بوّابات كلُّها `ACTIVE` ومُهايئان في الشيفرة**،
 * و`/admin/payments` يقول «٤ بوابات مربوطة» ويضع «بيع المركبات — الضمان»
 * على المصرفية ويعرض «٢٥٤٬٥٧٠ ريال محجوز الآن» — وهي لا تستطيع تحصيل
 * ريال، فكلُّ دفعٍ يُردّ بـ`GATEWAY_NOT_CONFIGURED` عند ضغط المشتري
 * «ادفع». والشيفرة كانت تعرف ذلك **في تعليقٍ وحده**.
 *
 * **والذي يمنع الكذب هو الاشتقاق لا هذا الاختبار.** كتبتُ القائمة أوّلًا
 * بيد، وهذا الاختبار يقابلها بالسلوك — ثمّ أضفتُ `tap` إليها كذبًا
 * **فمرّ**: من يفحص «ما خارج القائمة» لا يرى ما دخلها زورًا. فصارت
 * تُشتقّ من سجلّ المُهايئات نفسه، فادّعاءُ بوابةٍ يوجب كتابة وصلةٍ لها.
 *
 * ويبقى هذا الاختبار على الحافّتين: ما ليس في السجلّ لا يُحصّل، والتجريبية
 * تُحصّل. وهما ما يُقاس — أمّا «مُنفَّذةٌ تنتظر مفتاحًا» فلا يميّزها سلوكٌ
 * عن «بلا وصلة»، ولا يدّعي هذا الملفّ أنه يميّزها.
 */

afterAll(async () => {
  await db.$disconnect();
});

/** بوابةٌ بلا مُهايئ تردّ هذا الرمز من كل عملية. */
async function charges(key: string): Promise<boolean> {
  const port = await resolveForPayment(key, 'TEST');
  const result = await port.hold({
    purpose: 'WALLET_TOPUP',
    ref: `probe-${key}`,
    amount: '1.00',
    currency: 'SAR',
    method: 'card',
    returnUrl: 'https://example.test/return',
    idempotencyKey: `probe-${key}`,
  });
  return !(result.state === 'FAILED' && result.code === 'GATEWAY_NOT_CONFIGURED');
}

describe('البوّابات — ما يُدَّعى وما يُحَلّ', () => {
  it('كل بوابةٍ في القاعدة: الادّعاء يطابق الواقع', async () => {
    const gateways = await db.paymentGateway.findMany({ select: { key: true } });
    expect(gateways.length).toBeGreaterThan(0);

    const wrong: string[] = [];
    for (const gateway of gateways) {
      const claimed = gatewayImplemented(gateway.key);
      /**
       * **وبوابةٌ تحتاج سرًّا تُقاس بما تملكه البيئة.** `moyasar` بلا
       * مفاتيح تُحَلّ `pending` وهي مُنفَّذة — فالادّعاء شرطٌ لازم لا
       * كافٍ: ما لا يُدّعى **يجب** أن يسقط، وما يُدّعى قد ينتظر مفتاحًا.
       */
      if (!claimed && (await charges(gateway.key))) wrong.push(`${gateway.key}: لا يُدَّعى ويُحصّل`);
    }
    expect(wrong).toEqual([]);
  });

  it('والسندبوكس يُحصّل — وإلّا وقف كلُّ تجريب', async () => {
    expect(gatewayImplemented('sandbox')).toBe(true);
    expect(await charges('sandbox')).toBe(true);
  });

  /** وبوابةٌ مزروعةٌ خارج القائمة لا تُحصّل — وهي حالُ المصرفية وتاب. */
  it('ما ليس في القائمة يسقط بـGATEWAY_NOT_CONFIGURED', async () => {
    const gateways = await db.paymentGateway.findMany({ select: { key: true } });
    const outside = gateways.filter((row) => !IMPLEMENTED_GATEWAYS.includes(row.key));
    expect(outside.length).toBeGreaterThan(0);

    for (const gateway of outside) {
      expect(await charges(gateway.key), gateway.key).toBe(false);
    }
  });
});

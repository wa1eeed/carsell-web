import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MOYASAR_CAPABILITIES,
  createMoyasarAdapter,
  fromHalalas,
  toHalalas,
  type Fetcher,
} from '@/lib/payments/adapters/moyasar';
import { eligibility } from '@/lib/payments/gateway';

/**
 * الاختبار على **بوابة وهميّة تطبّق العقد** — لا اتصال بالمزوّد.
 *
 * فكل مسار مغطّى بلا مفاتيح، لكن **مطابقة الحقول تبقى غير مُثبَتة**:
 * لو سمّى Moyasar الحقل `transactionUrl` بدل `transaction_url` لمرّ
 * الاختبار وسقط الإنتاج. وهذا مكتوب في رأس المُهايئ وفي payments.md.
 */
function stub(responses: { status: number; body: unknown }[]): { fetcher: Fetcher; calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  let index = 0;
  const fetcher: Fetcher = (url, init) => {
    calls.push({ url, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return Promise.resolve(
      new Response(JSON.stringify(next?.body ?? {}), { status: next?.status ?? 200 }),
    );
  };
  return { fetcher, calls };
}

const HOLD = {
  purpose: 'VEHICLE_ESCROW' as const,
  ref: 'ORD-2026-0114',
  amount: '142850.00',
  currency: 'SAR',
  method: 'mada',
  returnUrl: 'https://carsell.one/return',
  idempotencyKey: 'idem-1',
};

describe('المبلغ بالهللات — أخطر سطر في المُهايئ', () => {
  it('الريال مئة هللة، والكسر لا يضيع', () => {
    expect(toHalalas('1.00')).toBe(100);
    expect(toHalalas('142850.00')).toBe(14285000);
    expect(toHalalas('0.50')).toBe(50);
    expect(toHalalas('99.99')).toBe(9999);
    // بلا كسر مكتوب
    expect(toHalalas('350')).toBe(35000);
    // وكسرٌ برقم واحد يُقرأ عشرات لا آحاد: «.5» نصف ريال لا خمس هللات
    expect(toHalalas('12.5')).toBe(1250);
  });

  it('والعودة تعكسها بلا فقد', () => {
    for (const amount of ['1.00', '0.50', '99.99', '142850.00', '12.50']) {
      expect(fromHalalas(toHalalas(amount))).toBe(amount);
    }
  });
});

describe('hold → authorize', () => {
  it('يحجز بلا تحصيل — `manual: true` وبالهللات', async () => {
    const { fetcher, calls } = stub([
      { status: 200, body: { id: 'pay_1', status: 'authorized', amount: 14285000 } },
    ]);
    const gateway = createMoyasarAdapter('sk_test', 'whsec', fetcher);

    const result = await gateway.hold(HOLD);
    expect(result.state).toBe('CONFIRMED');
    if (result.state === 'CONFIRMED') expect(result.holdRef).toBe('pay_1');

    const sent = calls[0]?.body as Record<string, unknown>;
    expect(sent.manual).toBe(true);
    expect(sent.amount).toBe(14285000);
    expect(calls[0]?.url).toContain('/payments');
  });

  it('تحدّي 3DS يعيد رابطه وحالةً تنتظره', async () => {
    const { fetcher } = stub([
      {
        status: 200,
        body: { id: 'pay_2', status: 'initiated', source: { transaction_url: 'https://acs/3ds' } },
      },
    ]);
    const result = await createMoyasarAdapter('sk', 'wh', fetcher).hold(HOLD);
    expect(result.state).toBe('REQUIRES_ACTION');
    if (result.state === 'REQUIRES_ACTION') expect(result.actionUrl).toBe('https://acs/3ds');
  });

  it('حالةٌ غير `authorized` تبقى PENDING لا CONFIRMED', async () => {
    const { fetcher } = stub([{ status: 200, body: { id: 'pay_3', status: 'initiated' } }]);
    const result = await createMoyasarAdapter('sk', 'wh', fetcher).hold(HOLD);
    // النطاق ينتظر الحالة لا الاستدعاء
    expect(result.state).toBe('PENDING');
  });

  it('رفض البوابة يفشل صراحةً برمزه', async () => {
    const { fetcher } = stub([{ status: 400, body: { message: 'invalid card' } }]);
    const result = await createMoyasarAdapter('sk', 'wh', fetcher).hold(HOLD);
    expect(result.state).toBe('FAILED');
    if (result.state === 'FAILED') {
      expect(result.code).toBe('HTTP_400');
      expect(result.message).toBe('invalid card');
    }
  });

  it('═══ سقوط الشبكة PENDING لا FAILED ═══', async () => {
    const fetcher: Fetcher = () => Promise.reject(new Error('ECONNRESET'));
    const result = await createMoyasarAdapter('sk', 'wh', fetcher).hold(HOLD);

    /**
     * الطلب قد يكون وصل ونُفِّذ. وإعلانُه فشلًا يجعل النطاق يعيد
     * المحاولة فتُخصم البطاقة مرّتين — وهو أسوأ ما يمكن أن يقع.
     */
    expect(result.state).toBe('PENDING');
  });
});

describe('settle → capture · cancel → void · partialReturn → refund', () => {
  it('التسوية الكاملة والجزئية', async () => {
    const full = stub([{ status: 200, body: { id: 'p', status: 'captured', captured: 14285000 } }]);
    const done = await createMoyasarAdapter('sk', 'wh', full.fetcher).settle('pay_1');
    expect(done.state).toBe('CONFIRMED');
    if (done.state === 'CONFIRMED') expect(done.settledAmount).toBe('142850.00');
    // الكاملة بلا مبلغ — والبوابة تأخذ المحجوز كلّه
    expect(full.calls[0]?.body).toEqual({});
    expect(full.calls[0]?.url).toContain('/capture');

    const partial = stub([{ status: 200, body: { id: 'p', status: 'captured', captured: 5000000 } }]);
    const some = await createMoyasarAdapter('sk', 'wh', partial.fetcher).settle('pay_1', '50000.00');
    expect((partial.calls[0]?.body as Record<string, unknown>).amount).toBe(5000000);
    if (some.state === 'CONFIRMED') expect(some.settledAmount).toBe('50000.00');
  });

  it('الإلغاء يُبطل الحجز — ولا استرجاع لأن المال لم يتحرّك', async () => {
    const { fetcher, calls } = stub([{ status: 200, body: { id: 'p', status: 'voided' } }]);
    const result = await createMoyasarAdapter('sk', 'wh', fetcher).cancel('pay_1');
    expect(result.state).toBe('CONFIRMED');
    expect(calls[0]?.url).toContain('/void');
  });

  it('الردّ الجزئي بعد التسوية', async () => {
    const { fetcher, calls } = stub([{ status: 200, body: { id: 'p', status: 'refunded' } }]);
    const result = await createMoyasarAdapter('sk', 'wh', fetcher).partialReturn('pay_1', '1000.00');
    expect(result.state).toBe('CONFIRMED');
    if (result.state === 'CONFIRMED') expect(result.returnedAmount).toBe('1000.00');
    expect(calls[0]?.url).toContain('/refund');
    expect((calls[0]?.body as Record<string, unknown>).amount).toBe(100000);
  });
});

describe('status — حالة المال كما تقولها البوابة', () => {
  it('تقرأ المحجوز والمسوّى والملغى', async () => {
    const held = stub([{ status: 200, body: { status: 'authorized' } }]);
    const a = await createMoyasarAdapter('sk', 'wh', held.fetcher).status('p');
    expect(a.held).toBe(true);
    expect(a.settled).toBe(false);

    const settled = stub([{ status: 200, body: { status: 'captured', captured: 100000 } }]);
    const b = await createMoyasarAdapter('sk', 'wh', settled.fetcher).status('p');
    expect(b.settled).toBe(true);
    expect(b.settledAmount).toBe('1000.00');

    const voided = stub([{ status: 200, body: { status: 'voided' } }]);
    expect((await createMoyasarAdapter('sk', 'wh', voided.fetcher).status('p')).cancelled).toBe(true);
  });
});

describe('التوقيع والقدرات', () => {
  it('التوقيع الصحيح يمرّ والمعبوث به يُرفض', () => {
    const secret = 'whsec_moyasar_test_value';
    const body = '{"type":"payment_paid","id":"evt_1"}';
    const signature = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    const gateway = createMoyasarAdapter('sk', secret, () => Promise.reject(new Error('unused')));

    expect(gateway.verifySignature(body, signature)).toBe(true);
    expect(gateway.verifySignature('{"type":"payment_paid","id":"evt_2"}', signature)).toBe(false);
    expect(gateway.verifySignature(body, '')).toBe(false);
  });

  it('قدراتها دون عتبة الضمان — والتحذير ينطق', () => {
    expect(MOYASAR_CAPABILITIES.maxHoldDays).toBe(7);
    const check = eligibility('VEHICLE_ESCROW', MOYASAR_CAPABILITIES);
    expect(check.eligible).toBe(true);
    if (check.eligible) {
      expect(check.shortfall).toEqual({ maxHoldDays: 7, neededDays: 21 });
    }
  });

  it('وتصلح لشحن المحفظة بلا تحذير — لا حجز مطلوبًا', () => {
    const check = eligibility('WALLET_TOPUP', MOYASAR_CAPABILITIES);
    expect(check.eligible).toBe(true);
    if (check.eligible) expect(check.shortfall).toBeNull();
  });
});

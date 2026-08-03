import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createSandboxAdapter } from '@/lib/payments/adapters/sandbox';
import { readCapabilities } from '@/lib/payments/gateway';

afterAll(async () => {
  // كل ما يصنعه الاختبار يُتبَع فيه — والدفتر التجريبيّ منه
  await db.sandboxTransaction.deleteMany({ where: { method: { startsWith: 'probe_' } } });
  await db.$disconnect();
});

const gateway = createSandboxAdapter(readCapabilities(null));

function hold(method: string, amount = '1000') {
  return gateway.hold({
    purpose: 'VEHICLE_ESCROW',
    ref: `T${String(Date.now())}`,
    amount,
    currency: 'SAR',
    method,
    returnUrl: 'http://localhost:3000/ar/account',
    idempotencyKey: `k${String(Date.now())}`,
  });
}

describe('البوابة التجريبية تُحاكي المزوّد لا تُجاريه', () => {
  it('الحجز يؤكَّد، ثم يُسوَّى، ثم لا يُلغى بعد التسوية', async () => {
    const held = await hold('probe_mada');
    expect(held.state).toBe('CONFIRMED');
    if (held.state !== 'CONFIRMED') return;

    const settled = await gateway.settle(held.holdRef);
    expect(settled.state).toBe('CONFIRMED');

    /**
     * **المُسوّى لا يُلغى** — وهذا ما يفعله المزوّد. ومُحاكاةٌ تسمح به
     * تجعل مسارًا يمرّ في التطوير ويسقط أوّل يومٍ في الإنتاج.
     */
    const late = await gateway.cancel(held.holdRef);
    expect(late.state).toBe('FAILED');
  });

  it('التسوية لا تتجاوز المحجوز', async () => {
    const held = await hold('probe_visa', '500');
    if (held.state !== 'CONFIRMED') throw new Error('expected a hold');

    const over = await gateway.settle(held.holdRef, '900');
    expect(over.state).toBe('FAILED');
    if (over.state === 'FAILED') expect(over.code).toBe('AMOUNT_EXCEEDS_HOLD');
  });

  it('البطاقة المرفوضة تُردّ فشلًا — والفشل يُختبَر كما يُختبَر النجاح', async () => {
    const declined = await gateway.hold({
      purpose: 'VEHICLE_ESCROW', ref: 'T-DECL', amount: '100', currency: 'SAR',
      method: 'test_declined', returnUrl: 'http://localhost:3000', idempotencyKey: 'k-decl',
    });
    expect(declined.state).toBe('FAILED');
  });

  it('لا توقّع — و«صحيح دائمًا» يمرّ في التطوير ويسقط في الإنتاج', () => {
    expect(gateway.verifySignature('{}', 'anything')).toBe(false);
  });

  it('تسوية اليوم تُعيد المعاملات لا المجموع وحده', async () => {
    const held = await hold('probe_stmt', '250');
    if (held.state !== 'CONFIRMED') throw new Error('expected a hold');
    await gateway.settle(held.holdRef);

    const statement = await gateway.settlementFor(new Date());
    expect(statement.available).toBe(true);
    if (!statement.available) return;
    // الفرق حدثٌ يُعالَج — ومجموعٌ لا يقول أيّ معاملةٍ اختلفت لا يُعالَج
    expect(statement.entries.length).toBeGreaterThan(0);
    expect(statement.entries.every((entry) => entry.ref !== '')).toBe(true);
  });
});

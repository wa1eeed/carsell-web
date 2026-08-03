import { describe, expect, it } from 'vitest';
import {
  PURPOSE_REQUIREMENTS,
  eligibility,
  pendingGateway,
  readCapabilities,
  type GatewayCapabilities,
} from '@/lib/payments/gateway';

/** القدرات كما في A20 — بوابة مصرفية · ميسر · تاب. */
const BANK: GatewayCapabilities = {
  supportsHold: true, supportsPartialSettle: true, supportsRefund: true,
  maxHoldDays: 30, settlementDelayHours: 36, feePct: 0.8, feeFixed: 2,
};
const MOYASAR: GatewayCapabilities = {
  supportsHold: true, supportsPartialSettle: true, supportsRefund: true,
  maxHoldDays: 7, settlementDelayHours: 0, feePct: 2.75, feeFixed: 1,
};
const TAP: GatewayCapabilities = {
  supportsHold: true, supportsPartialSettle: true, supportsRefund: true,
  maxHoldDays: 6, settlementDelayHours: 0, feePct: 2.65, feeFixed: 1,
};
const NO_HOLD: GatewayCapabilities = { ...MOYASAR, supportsHold: false };
const NO_PARTIAL: GatewayCapabilities = { ...MOYASAR, supportsPartialSettle: false };

describe('═══ القاعدة ٢ ═══ القدرة الناقصة تُخفي، والمدّة القصيرة تُحذّر', () => {
  it('بوابة بلا حجز لا تصلح للضمان — ولا تظهر في القائمة أصلًا', () => {
    const result = eligibility('VEHICLE_ESCROW', NO_HOLD);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.missing).toContain('supportsHold');
  });

  it('وبلا تسوية جزئية لا تصلح — فالنزاع قد يُحسم بتسوية جزئية', () => {
    const result = eligibility('VEHICLE_ESCROW', NO_PARTIAL);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.missing).toEqual(['supportsPartialSettle']);
  });

  it('مدّة حجز أقصر ⇒ تحذير يشرح الأثر ولا يمنع', () => {
    const tap = eligibility('VEHICLE_ESCROW', TAP);
    expect(tap.eligible).toBe(true);
    if (tap.eligible) {
      expect(tap.shortfall).not.toBeNull();
      // **بيانات لا نصّ**: النطاق يقول الأرقام، والشاشة تصوغها بـQuantity
      expect(tap.shortfall).toEqual({ maxHoldDays: 6, neededDays: 21 });
    }
  });

  it('ولا نصّ عربيّ في النطاق — فالصياغة ليست من شأنه', () => {
    const tap = eligibility('VEHICLE_ESCROW', TAP);
    // نصٌّ مبنيّ هنا كان يُنتج «6 يومًا»: رقمًا لاتينيًّا وجمعًا خاطئًا
    expect(JSON.stringify(tap)).not.toMatch(/[\u0600-\u06FF]/);
  });

  it('والمصرفية بلا تحذير — فوق حدّ الإنذار', () => {
    const bank = eligibility('VEHICLE_ESCROW', BANK);
    expect(bank.eligible).toBe(true);
    if (bank.eligible) expect(bank.shortfall).toBeNull();
  });

  it('شحن المحفظة لا يشترط حجزًا — تحصيل فوريّ', () => {
    const result = eligibility('WALLET_TOPUP', NO_HOLD);
    expect(result.eligible).toBe(true);
  });

  it('كل غرض له متطلّبات معلَنة — ولا غرض بلا صفّ', () => {
    const purposes = Object.keys(PURPOSE_REQUIREMENTS);
    expect(purposes).toHaveLength(6);
    for (const purpose of purposes) {
      expect(PURPOSE_REQUIREMENTS[purpose as keyof typeof PURPOSE_REQUIREMENTS].labelAr).not.toBe('');
    }
  });
});

describe('البوابة غير المضبوطة تفشل صراحةً', () => {
  it('كل دالّة تعيد FAILED باسم مفهوم — ولا صمت', async () => {
    const gateway = pendingGateway('moyasar', 'TEST');

    const hold = await gateway.hold({
      purpose: 'VEHICLE_ESCROW', ref: 'ORD-1', amount: '1000',
      currency: 'SAR', method: 'mada', returnUrl: 'https://x', idempotencyKey: 'k',
    });
    expect(hold.state).toBe('FAILED');
    if (hold.state === 'FAILED') expect(hold.code).toBe('GATEWAY_NOT_CONFIGURED');

    expect((await gateway.settle('h1')).state).toBe('FAILED');
    expect((await gateway.cancel('h1')).state).toBe('FAILED');
    expect((await gateway.partialReturn('s1', '10')).state).toBe('FAILED');
    expect((await gateway.status('h1')).state).toBe('FAILED');
  });

  it('ولا توقيع صحيح بلا سرّ — فأيّ ويبهوك يُرفض', () => {
    expect(pendingGateway('moyasar', 'TEST').verifySignature('{}', 'anything')).toBe(false);
  });
});

describe('قراءة القدرات من JSON', () => {
  it('الغائب يُقرأ false وصفرًا — لا يُفترض مدعومًا', () => {
    const empty = readCapabilities(null);
    expect(empty.supportsHold).toBe(false);
    expect(empty.maxHoldDays).toBe(0);

    // وبوابة بقدرات فارغة لا تصلح للضمان
    expect(eligibility('VEHICLE_ESCROW', empty).eligible).toBe(false);
  });

  it('والقيَم المكتوبة تُقرأ كما هي', () => {
    const read = readCapabilities(BANK as unknown);
    expect(read).toEqual(BANK);
  });
});

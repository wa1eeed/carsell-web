import { describe, expect, it } from 'vitest';
import { normalizeSaudiPhone } from '@/lib/domain/phone';

describe('تطبيع رقم الجوال', () => {
  it('يوحّد كل الصيغ المقبولة إلى E.164 — وإلا صار للمستخدم حسابان', () => {
    const expected = '+966512345678';
    for (const input of [
      '0512345678',
      '+966512345678',
      '966512345678',
      '00966512345678',
      '512345678',
      '05 12 345 678',
      '05-1234-5678',
      '٠٥١٢٣٤٥٦٧٨',
    ]) {
      expect(normalizeSaudiPhone(input), input).toBe(expected);
    }
  });

  it('يرفض ما ليس جوالًا سعوديًا', () => {
    for (const input of ['0412345678', '05123456', '051234567890', '', 'abc', '+971512345678']) {
      expect(normalizeSaudiPhone(input), input).toBeNull();
    }
  });
});

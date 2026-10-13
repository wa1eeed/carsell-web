import { describe, expect, it } from 'vitest';
import { normalizeSaudiPhone, normalizeSaudiContactPhone } from '@/lib/domain/phone';

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

/**
 * ═══ ورقمُ المنشأة أرضيٌّ غالبًا ═══
 *
 * رقمُ الهوية جوّالٌ بحقّ: حسابٌ واحد لرقمٍ واحد، وإليه تصل رسالة
 * التحقّق. أمّا رقمُ **معرضٍ أو شركة فحص** فيُنسخ من ترويسة السجلّ
 * التجاريّ وأكثرُه أرضيّ — ورفضُه يصنع الخطأ الذي يظنّ أنه يمنعه.
 *
 * وقِيس بالنقر: استمارةُ المزوّد ردّت «+966 11 234 5678» بـ«الصيغة غير
 * صحيحة»، وهو رقمُ مركز فحصٍ صحيح.
 */
describe('تطبيع رقم المنشأة', () => {
  it('يقبل الأرضيّ بمفاتيح المناطق السعودية', () => {
    for (const [input, expected] of [
      ['+966 11 234 5678', '+966112345678'],
      ['0112345678', '+966112345678'],
      ['00966122345678', '+966122345678'],
      ['013-234-5678', '+966132345678'],
      ['٠١٧٢٣٤٥٦٧٨', '+966172345678'],
    ] as const) {
      expect(normalizeSaudiContactPhone(input), input).toBe(expected);
    }
  });

  it('ويقبل الجوّال كما يقبله أخوه', () => {
    expect(normalizeSaudiContactPhone('0501234567')).toBe('+966501234567');
    expect(normalizeSaudiContactPhone('٠٥١٢٣٤٥٦٧٨')).toBe('+966512345678');
  });

  it('ويرفض ما ليس رقمًا سعوديًّا', () => {
    for (const input of ['0412345678', '011234567', '+971512345678', '', 'abc']) {
      expect(normalizeSaudiContactPhone(input), input).toBeNull();
    }
  });

  /** والهويّة لا تتأثّر: أرضيٌّ ليس حسابًا. */
  it('ولا يقبل رقم الهوية أرضيًّا', () => {
    expect(normalizeSaudiPhone('0112345678')).toBeNull();
  });
});

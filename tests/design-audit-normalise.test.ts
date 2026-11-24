import { describe, expect, it } from 'vitest';
// @ts-expect-error — أداةُ قياسٍ بلا أنواع، وتُختبَر سلوكًا
import { isDataValue, normalizeText } from '../scripts/design-audit.mjs';

/**
 * ═══ المقياسُ يطبّع ما نُقض، ولا يُسقط ما لم يُنقَض ═══
 *
 * بلا هذا التطبيع قرأ `design-audit` شاشةَ إشعارات الدفع **١٣٪** وهي
 * مبنيّةٌ في معظمها: الفرقُ كلُّه ثلاثةُ قراراتٍ وقعت بعد رسم التصميم.
 * ومقياسٌ يعدّ القرارَ نقصًا يُرسل قارئَه ليعيد ما نُقض عمدًا.
 *
 * **والاختبار يفحص الاتّجاهين**: أنّ المقرَّر يُطبَّع، وأنّ ما لم يُقرَّر
 * يبقى فرقًا — وإلّا صار التطبيع عمًى يمرّر كلَّ شيء.
 */
describe('تطبيع مقياس المطابقة', () => {
  it('يمسح التشكيل — القرار ١٥', () => {
    expect(normalizeText('حرِجة')).toBe(normalizeText('حرجة'));
    expect(normalizeText('افتراضيًا')).toBe(normalizeText('افتراضيا'));
  });

  it('يوحّد الأرقام وفواصلها — قرار ٢٠٢٦-١٠-١٢', () => {
    expect(normalizeText('٤٠ حرفًا')).toBe(normalizeText('40 حرفا'));
    expect(normalizeText('٣٬٤٥٦ كم')).toBe(normalizeText('3,456 كم'));
    expect(normalizeText('١٢٫٥٪')).toBe(normalizeText('12.5٪'));
  });

  it('يوحّد الاسم بعد تغيير العلامة', () => {
    expect(normalizeText('carsell.one')).toBe('CARZ');
    expect(normalizeText('CARSELL.ONE')).toBe('CARZ');
  });

  it('ولا يطمس فرقًا حقيقيًّا', () => {
    expect(normalizeText('سجل الإرسال')).not.toBe(normalizeText('سجل التدقيق'));
    expect(normalizeText('معدّل الفتح')).not.toBe(normalizeText('معدل التسليم'));
    /** الحروفُ اللاتينية لا تُعجَم: `K5` ليست `K6`. */
    expect(normalizeText('K5')).not.toBe(normalizeText('K6'));
  });

  it('وقيمةُ البيانات تخرج من القياس', () => {
    /** «٩٬٣٢٠ جهازًا مسجّلًا» رقمُ بذرةٍ لا بنيةُ شاشة */
    expect(isDataValue('٩٬٣٢٠')).toBe(true);
    expect(isDataValue('٧٢٪')).toBe(true);
    expect(isDataValue('٩٤٫٨٪')).toBe(true);
    /** ونصٌّ فيه رقمٌ ليس قيمةَ بيانات */
    expect(isDataValue('أذونات ممنوحة')).toBe(false);
    expect(isDataValue('٩٬٣٢٠ جهازًا مسجّلًا')).toBe(false);
  });
});

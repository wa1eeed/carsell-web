import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { LEAN_KEY, lookupCorporate, normalizeUnifiedNumber } from '@/lib/integrations/lean';

/**
 * ═══ جلبُ السجلّ التجاريّ — وكل تكامل خلف راية يسقط بصمت ═══
 *
 * ما دامت مفاتيح لين لم تصل فالفشل هو **الحال المتوقَّعة**، وتحويلُ
 * المتوقَّع إلى خطأ يُشعر المعرض أنه أخطأ وهو لم يخطئ. فتُعاد
 * `NOT_CONFIGURED` ويبقى الإدخال اليدويّ مفتوحًا بسطرٍ رمادي واحد.
 *
 * **ولا يُنادى الخارج قبل أن يُفحص الشكل**: نداءٌ برقمٍ من ثلاث خانات
 * يُنفق مهلةً ويعود بخطأٍ معروفٍ سلفًا.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('الرقم الموحَّد يُطبَّع', () => {
  it('يقبل اللصق بفواصله وبالأرقام العربية', () => {
    expect(normalizeUnifiedNumber('7001-234 567')).toBe('7001234567');
    expect(normalizeUnifiedNumber('٧٠٠١٢٣٤٥٦٧')).toBe('7001234567');
    expect(normalizeUnifiedNumber(' 7001234567 ')).toBe('7001234567');
  });
});

describe('الجلب حين لا مفاتيح', () => {
  /** والشكل يُفحص أوّلًا — فلا مهلةَ تُنفَق على ما يُعرف جوابُه. */
  it('رقمٌ قصير يُردّ INVALID بلا نداء', async () => {
    const result = await lookupCorporate('123');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('INVALID');
  });

  it('وتكاملٌ غير مفعَّل يُردّ NOT_CONFIGURED لا خطأً', async () => {
    const row = await db.integration.findUnique({
      where: { key: LEAN_KEY },
      select: { status: true },
    });
    expect(row).not.toBeNull();
    expect(row?.status).not.toBe('ACTIVE');

    const result = await lookupCorporate('7001234567');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NOT_CONFIGURED');
  });
});

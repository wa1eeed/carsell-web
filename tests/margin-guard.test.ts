import { describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { computeTax } from '@/lib/domain/tax';

/**
 * ═══ الهامشُ الغائب ليس صفرًا ═══
 *
 * `computeTax` تقرأ `marginAmount ?? 0` — فقاعدةٌ تقول `MARGIN` بلا
 * مقدارٍ مُمرَّر كانت تحسب الضريبة **على صفر**، فتصدر فاتورةٌ بضريبةٍ
 * صفرية على بيعةٍ مستحقّة. ولا شيء يمرّرها اليوم: لا سعرَ شراءٍ على
 * `Vehicle` أصلًا.
 *
 * **وما يحتاج حراسةً يُبنى محروسًا**: القاعدة الوحيدة معطَّلة ولا معتمَد
 * لها اليوم، وبين تفعيلها وبناء الحارس نافذةٌ تُصدر فيها فواتير بصفر —
 * وواحدةٌ منها تكفي. فالردّ في `taxFor` قبل أن تُحسب.
 */

describe('حسابُ الهامش', () => {
  it('يحسب على الهامش لا على السعر حين يُمرَّر', () => {
    // بيعت بـ١٠٠٬٠٠٠ وشُريت بـ٩٠٬٠٠٠ ⇒ الهامش ١٠٬٠٠٠، والضريبة شاملةٌ فيه
    const amounts = computeTax('MARGIN', '100000', '15', new Prisma.Decimal('10000'));
    expect(amounts.total).toBe('100000');
    // ١٥٪ شاملة من ١٠٬٠٠٠ = ١٬٣٠٤٫٣٥
    expect(Number(amounts.taxTotal)).toBeCloseTo(1304.35, 1);
  });

  it('وهامشٌ صفرٌ صريح يُحسب صفرًا — بِيعت بسعر شرائها', () => {
    const amounts = computeTax('MARGIN', '100000', '15', new Prisma.Decimal('0'));
    expect(amounts.taxTotal).toBe('0');
  });

  /**
   * وهذه هي الحال الخطرة: الغياب كان يُقرأ صفرًا. والحساب نفسه يبقى
   * كما هو — والردُّ في `taxFor` قبل أن يُنادى، فلا تُبنى فاتورة أصلًا.
   */
  it('والقيمة الكاملة تُحسب على السعر كلّه', () => {
    const amounts = computeTax('FULL_VALUE', '100000', '15');
    expect(Number(amounts.taxTotal)).toBeCloseTo(13043.48, 1);
  });
});

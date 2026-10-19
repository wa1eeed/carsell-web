import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { PRICE_STAT_MIN_SAMPLE, priceStatFor } from '@/lib/domain/listing-detail';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();
const ar = JSON.parse(readFileSync(join(ROOT, 'src/messages/ar.json'), 'utf8')) as {
  sell: Record<string, string>;
};
const guidance = stripComments(
  readFileSync(join(ROOT, 'src/components/site/PriceGuidance.tsx'), 'utf8'),
);

/**
 * ═══ الصدرُ وعد، فلا يُترك بلا جواب ═══
 *
 * كان يقول «ونقترح عليك سعرًا مبنيًّا على صفقات حقيقية»، و`PriceGuidance`
 * تعود `null` ما دامت الخانةُ فارغة — **فهي تُموضِع رقمًا اختاره البائع
 * ولا تقترح عليه شيئًا**. ولـ٤٢ طرازًا من ٧٣ لا إحصاءَ أصلًا، فلا يظهر
 * شيءٌ في الحالين.
 */
describe('صفحة البيع تقترح سعرًا أو تكفّ عن الوعد به', () => {
  it('وللحالات الثلاث نصُّها', () => {
    for (const key of ['suggestTitle', 'suggestNote', 'suggestUse', 'suggestNone']) {
      expect(ar.sell[key], key).toBeTruthy();
    }
  });

  /**
   * **والنصّ المعروض وعدٌ لا وصف.** فما دام الاقتراحُ لا يقع إلّا حين
   * توجد صفقات، يقول الصدرُ ما يقع دائمًا — والاقتراحُ فوقه حين تتوفّر.
   */
  it('والصدر يعد بما يقع دائمًا', () => {
    for (const key of ['lead', 'leadVin']) {
      expect(ar.sell[key], key).toContain('نريك أين يقع سعرك');
      expect(ar.sell[key], key).not.toContain('ونقترح عليك سعرا');
    }
  });

  /** **والفروع الثلاثة في المكوّن** — اقتراحٌ، وصمتٌ مُعلَّل، وموضعة. */
  it('والمكوّن يقترح قبل أن يُكتب سعر، ويقول حين لا يملك', () => {
    /**
     * **والشرطُ يُفحص لا وجودُ النصّ.** أوّلُ صياغةٍ بحثت عن
     * `t('suggestTitle')` وحدها، **فتعطيلُ الفرع بـ`if (false)` تركها
     * خضراء** — فالنصُّ باقٍ في فرعٍ ميّت. وهو شكلُ «ظهر الاسمُ ⇒ إذن
     * هو موصول» الذي خدع البوابات ٥٠ و٥٢ و١٩.
     */
    expect(guidance).toMatch(/if \(price <= 0\) \{[\s\S]*?t\('suggestTitle'\)/);
    expect(guidance).toMatch(/if \(stat === null\) \{[\s\S]*?t\('suggestNone'\)/);
    expect(guidance).toContain('onUse');
    // والموضعةُ باقية لمن كتب سعرًا
    expect(guidance).toContain("t('atMarket')");
  });

  /** **والزرُّ يبلغ الخانة** — واقتراحٌ لا يملؤها رقمٌ يُنسَخ بيد. */
  it('والمعالج يمرّر ما يملأ الخانة', () => {
    const wizard = stripComments(
      readFileSync(join(ROOT, 'src/app/[locale]/(site)/sell/SellWizard.tsx'), 'utf8'),
    );
    expect(wizard).toMatch(/onUse=\{\(suggested\) => setPrice\(/);
  });

  /**
   * ═══ والرقمُ المقترَح وسيطٌ حقيقيّ ═══
   *
   * يُقاس على صفٍّ مزروع: الوسيطُ بين الربيعين، والعيّنة لا تقلّ عن
   * الحدّ — فما يُقترَح مبنيٌّ على ما يكفي، لا على صفقةٍ أو اثنتين.
   */
  it('والمقترَح وسيطُ شريحةٍ عيّنتُها تكفي', async () => {
    const row = await db.priceStat.findFirst({ orderBy: { sampleSize: 'desc' } });
    expect(row, 'لا إحصاءَ مزروع — فالقياس لا يقع').not.toBeNull();
    if (row === null) return;

    const stat = await priceStatFor({
      modelId: row.modelId,
      trimId: row.trimId === '*' ? null : row.trimId,
      year: row.year,
      city: row.city === '*' ? 'الرياض' : row.city,
      mileageKm: row.mileageBucket * 1000,
    });
    expect(stat).not.toBeNull();
    if (stat === null) return;

    expect(stat.sampleSize).toBeGreaterThanOrEqual(PRICE_STAT_MIN_SAMPLE);
    expect(stat.p50).toBeGreaterThan(0);
    expect(stat.p50).toBeGreaterThanOrEqual(stat.p25);
    expect(stat.p50).toBeLessThanOrEqual(stat.p75);
  });
});

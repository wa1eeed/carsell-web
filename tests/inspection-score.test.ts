import { describe, expect, it } from 'vitest';
import { scoreInspection, type ScoredItem } from '@/lib/domain/inspection-score';

/**
 * ═══ الدرجةُ وحدةٌ خالصة — تُختبر بلا قاعدة ═══
 *
 * المواصفة تطلب «منطقًا في وحدةٍ واحدة باختبارات». وهذه تقيس القواعد
 * الأربع: التدرّج، وخروجَ «لا ينطبق»، والوزن، وسقفَ البند الحرج.
 */

const CATS = [
  { key: 'engine', weight: 1 },
  { key: 'body', weight: 1 },
];

function item(
  categoryKey: string,
  state: ScoredItem['state'],
  options: { critical?: boolean; id?: string } = {},
): ScoredItem {
  return {
    itemId: options.id ?? `${categoryKey}-${state}-${Math.random().toString(36).slice(2, 8)}`,
    categoryKey,
    isCritical: options.critical ?? false,
    state,
  };
}

describe('التدرّجُ بين الملاحظة والعطل', () => {
  it('كلُّه سليم يُعطي مئة', () => {
    const result = scoreInspection(
      [item('engine', 'PASS'), item('body', 'PASS')],
      CATS,
    );
    expect(result.score).toBe(100);
    expect(result.grade).toBe('EXCELLENT');
    expect(result.flagged).toBe(false);
  });

  it('وكلُّه عطلٌ يُعطي صفرًا', () => {
    const result = scoreInspection(
      [item('engine', 'MAJOR'), item('body', 'MAJOR')],
      CATS,
    );
    expect(result.score).toBe(0);
    expect(result.grade).toBe('POOR');
  });

  /** **وملاحظةٌ تنقص أقلَّ من عطل** — وإلّا لم تفرّق الدرجةُ بين خدشٍ وبابٍ لا يُغلق. */
  it('والملاحظةُ بين الاثنين — أعلى من العطل وأدنى من السليم', () => {
    const minor = scoreInspection([item('engine', 'MINOR')], [CATS[0]!]).score;
    const major = scoreInspection([item('engine', 'MAJOR')], [CATS[0]!]).score;
    const pass = scoreInspection([item('engine', 'PASS')], [CATS[0]!]).score;

    expect(major).toBeLessThan(minor);
    expect(minor).toBeLessThan(pass);
  });
});

describe('و«لا ينطبق» يخرج من الحساب', () => {
  /**
   * سيارةٌ بلا فتحة سقف ليست ناقصةً فتحةَ سقف — وعدُّها عطلًا يعاقب
   * صاحبَها على ما لم يكن فيها قطّ.
   */
  it('بندٌ لا ينطبق لا يُنقص الدرجة', () => {
    const withNa = scoreInspection(
      [item('engine', 'PASS'), item('engine', 'NOT_APPLICABLE')],
      [CATS[0]!],
    );
    const without = scoreInspection([item('engine', 'PASS')], [CATS[0]!]);

    expect(withNa.score).toBe(without.score);
    expect(withNa.score).toBe(100);
    expect(withNa.applicable).toBe(1);
    expect(withNa.categories[0]?.notApplicable).toBe(1);
  });

  it('وقسمٌ كلُّه لا ينطبق يخرج بوزنه فلا يجرّ المتوسّط', () => {
    const result = scoreInspection(
      [item('engine', 'PASS'), item('body', 'NOT_APPLICABLE')],
      CATS,
    );
    expect(result.score).toBe(100);
    expect(result.categories.find((c) => c.key === 'body')?.score).toBeNull();
  });
});

describe('والوزنُ للقسم لا لعدد بنوده', () => {
  /**
   * قسمٌ بخمسةٍ وستّين بندًا لا يطغى على قسمٍ بخمسةَ عشر لأن بنودَه
   * أكثر — فالوزنُ يقرّره المشغّل.
   */
  it('قسمان متساويا الوزن يتساويان ولو اختلف عددُ بنودهما', () => {
    const result = scoreInspection(
      [
        item('engine', 'PASS'),
        item('engine', 'PASS'),
        item('engine', 'PASS'),
        item('body', 'MAJOR'),
      ],
      CATS,
    );
    /** المحرّك ١٠٠ والهيكل ٠ بوزنٍ واحد ⇒ ٥٠، لا ٧٥ بعدّ البنود. */
    expect(result.score).toBe(50);
  });

  it('ووزنٌ أعلى يرجّح قسمَه', () => {
    const result = scoreInspection(
      [item('engine', 'PASS'), item('body', 'MAJOR')],
      [
        { key: 'engine', weight: 3 },
        { key: 'body', weight: 1 },
      ],
    );
    expect(result.score).toBe(75);
  });
});

describe('والبندُ الحرج يسقف التقدير ويَسِم التقرير', () => {
  it('عطلٌ حرج يسقف التقدير ولو كانت الدرجة عالية', () => {
    const items = [
      ...Array.from({ length: 40 }, () => item('engine', 'PASS')),
      item('body', 'MAJOR', { critical: true, id: 'chassis-weld' }),
      ...Array.from({ length: 39 }, () => item('body', 'PASS')),
    ];
    const result = scoreInspection(items, CATS);

    expect(result.score).toBeGreaterThan(90);
    /** **والدرجةُ تبقى كما هي** — فمئتان وتسعةُ بنودٍ سليمة حقيقةٌ تُقال. */
    expect(result.grade).toBe('FAIR');
    expect(result.flagged).toBe(true);
    expect(result.criticalItemIds).toEqual(['chassis-weld']);
  });

  it('وبندٌ حرجٌ بملاحظة لا يسقف', () => {
    const result = scoreInspection(
      [item('engine', 'PASS'), item('body', 'MINOR', { critical: true })],
      CATS,
    );
    expect(result.flagged).toBe(false);
    expect(result.grade).not.toBe('FAIR');
  });

  /** **ولا يُرفع تقديرٌ بالسقف** — السقفُ حدٌّ أعلى لا قيمةٌ تُفرض. */
  it('ولا يرفع السقفُ تقديرًا هو دونه أصلًا', () => {
    const result = scoreInspection(
      [item('engine', 'MAJOR'), item('body', 'MAJOR', { critical: true })],
      CATS,
    );
    expect(result.score).toBe(0);
    expect(result.grade).toBe('POOR');
    expect(result.flagged).toBe(true);
  });
});

/**
 * ═══ والأوزانُ المُقرّة — قرار المالك ٢٠٢٦-١٠-١٧ ═══
 *
 * كانت كلُّها ١، فكلُّ قسمٍ سدسُ الدرجة مهما كلّف إصلاحُه: **إطاراتٌ
 * مهترئة وهيكلٌ معوجّ يقرآن ٨٣** — والأولى تُبدَّل بثلاثة آلاف،
 * والثاني هو سببُ ألّا تشتريها.
 *
 * والمعيار المُقرّ: كلفةُ الإصلاح وأثرُه على القرار. وهذا يحرس
 * **العلاقة** لا الرقم: ما لا يُصلَح يُنقص أكثرَ ممّا يُشترى من أيّ
 * محلّ.
 */
describe('أوزانُ الأقسام المُقرّة', () => {
  const APPROVED = [
    { key: 'body', weight: 3 },
    { key: 'engine', weight: 3 },
    { key: 'transmission', weight: 2 },
    { key: 'brakes', weight: 2 },
    { key: 'electric', weight: 1 },
    { key: 'tyres', weight: 1 },
  ];

  /** قسمٌ واحد ساقطٌ كلُّه، والباقي سليم */
  function withFailed(failedKey: string): ScoredItem[] {
    return APPROVED.map((category) => ({
      itemId: `i-${category.key}`,
      categoryKey: category.key,
      state: category.key === failedKey ? ('MAJOR' as const) : ('PASS' as const),
      isCritical: false,
    }));
  }

  it('الهيكلُ أثقلُ من الإطارات — ولم يكونا كذلك', () => {
    const body = scoreInspection(withFailed('body'), APPROVED);
    const tyres = scoreInspection(withFailed('tyres'), APPROVED);

    /** ٩ من ١٢ وزنًا ⇒ ٧٥ · و١١ من ١٢ ⇒ ٩٢ */
    expect(body.score).toBe(75);
    expect(tyres.score).toBe(92);
    /** **والعلاقةُ هي المقصودة**: ما لا يُصلَح يُنقص أكثر */
    expect(body.score).toBeLessThan(tyres.score);
  });

  it('والمحركُ كالهيكل، والفراملُ فوق الكهرباء', () => {
    const engine = scoreInspection(withFailed('engine'), APPROVED);
    const brakes = scoreInspection(withFailed('brakes'), APPROVED);
    const electric = scoreInspection(withFailed('electric'), APPROVED);

    expect(engine.score).toBe(75);
    expect(brakes.score).toBeLessThan(electric.score);
  });

  /**
   * **وبأوزانٍ متساوية يستوي الكلُّ** — وهو ما كان، وهو ما أُصلح.
   * فهذا يُثبّت أنّ الفرق من الوزن لا من شيءٍ آخر.
   */
  it('وبأوزانٍ متساوية يستوي الهيكل والإطارات — وهو العطب', () => {
    const flat = APPROVED.map((category) => ({ ...category, weight: 1 }));
    expect(scoreInspection(withFailed('body'), flat).score).toBe(
      scoreInspection(withFailed('tyres'), flat).score,
    );
  });
});

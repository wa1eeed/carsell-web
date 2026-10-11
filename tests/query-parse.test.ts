import { describe, expect, it } from 'vitest';
import { normalize, parseQuery, type Chip, type Vocabulary } from '@/lib/domain/query-parse';

/**
 * ═══ محلّل الجملة ═══
 *
 * العطل الذي وُلد منه هذا الملف: **شريط البحث في صدر الرئيسية كان
 * زينة.** يرسل `q` ولا شيء يقرؤه — فمن كتب «كامري ٢٠٢٠ مستعملة»
 * وصل إلى السيارات الستّ والأربعين كلّها، وهو العدد نفسه الذي يصله
 * من كتب حروفًا عشوائية.
 *
 * والمحلّل نقيّ، فالمفردات تُمرَّر هنا بلا قاعدة.
 */

const VOCABULARY: Vocabulary = {
  brands: [
    { id: 'b-toyota', names: ['تويوتا', 'Toyota'] },
    { id: 'b-nissan', names: ['نيسان', 'Nissan'] },
  ],
  models: [
    { id: 'm-camry', brandId: 'b-toyota', names: ['كامري', 'Camry'] },
    { id: 'm-land', brandId: 'b-toyota', names: ['لاند كروزر', 'Land Cruiser'] },
    { id: 'm-altima', brandId: 'b-nissan', names: ['ألتيما', 'Altima'] },
  ],
  cities: ['الرياض', 'جدة', 'الدمام'],
};

const value = (chips: readonly Chip[], field: Chip['field']): unknown =>
  chips.find((chip) => chip.field === field)?.value;

describe('التطبيع', () => {
  it('يوحّد الأرقام والهمزات والتاء المربوطة', () => {
    expect(normalize('٢٠٢٠')).toBe('2020');
    expect(normalize('الرِّيَاض')).toBe('الرياض');
    expect(normalize('مستعملة')).toBe('مستعمله');
    expect(normalize('أُوتوماتيك')).toBe('اوتوماتيك');
    // فواصل الآلاف لا تفرّق رقمًا عن رقم
    expect(normalize('١٥٠٬٠٠٠')).toBe('150 000');
  });
});

describe('الجملة الكاملة', () => {
  it('«كامري ٢٠٢٠ مستعملة في الرياض تحت ١٠٠ ألف»', () => {
    const { chips, rest } = parseQuery('كامري ٢٠٢٠ مستعملة في الرياض تحت ١٠٠ ألف', VOCABULARY);

    expect(value(chips, 'modelId')).toBe('m-camry');
    /** **والموديل يجرّ ماركته** — «كامري» تويوتا ولو لم تُذكر. */
    expect(value(chips, 'brandId')).toBe('b-toyota');
    expect(value(chips, 'yearFrom')).toBe(2020);
    expect(value(chips, 'condition')).toBe('USED');
    expect(value(chips, 'city')).toBe('الرياض');
    expect(value(chips, 'priceMax')).toBe(100_000);
    expect(rest).toBe('');
  });

  it('يفرّق «من ٢٠٢٠» عن «قبل ٢٠٢٠» عن «٢٠٢٠ وأقدم»', () => {
    expect(value(parseQuery('من ٢٠٢٠', VOCABULARY).chips, 'yearFrom')).toBe(2020);
    expect(value(parseQuery('قبل ٢٠٢٠', VOCABULARY).chips, 'yearTo')).toBe(2020);
    expect(value(parseQuery('٢٠٢٠ وأحدث', VOCABULARY).chips, 'yearFrom')).toBe(2020);
    expect(value(parseQuery('٢٠٢٠ وأقدم', VOCABULARY).chips, 'yearTo')).toBe(2020);
  });

  /**
   * **سنةٌ أم سعر؟** والمضاعِف وحده يحسم. فـ«تحت ٢٠٢٠» عند من يشتري
   * سيارةً موديلٌ لا ثمن — ولو قُرئ سعرًا لعُرضت الأغلى لمن طلب
   * الأرخص.
   */
  it('يقرأ الأربع خانات سنةً، والمضاعِف وحده يجعلها سعرًا', () => {
    const below = parseQuery('سيارة تحت ٢٠٢٠', VOCABULARY).chips;
    expect(value(below, 'yearTo')).toBe(2020);
    expect(value(below, 'priceMax')).toBeUndefined();

    expect(value(parseQuery('٢٠٢٠ ألف', VOCABULARY).chips, 'priceMax')).toBe(2_020_000);
  });

  /** «تحت ١٠٠» مئةُ ألف لا مئة ريال — ولا سيارة بمئة ريال. */
  it('يضاعف الرقم الصغير في سياق السعر', () => {
    expect(value(parseQuery('تحت ١٥٠', VOCABULARY).chips, 'priceMax')).toBe(150_000);
    expect(value(parseQuery('أكثر من ٨٠ ألف', VOCABULARY).chips, 'priceMin')).toBe(80_000);
    expect(value(parseQuery('أقل من ١٥٠٬٠٠٠', VOCABULARY).chips, 'priceMax')).toBe(150_000);
  });

  /** **والأطول أوّلًا** — وإلّا قُرئت «لاند كروزر» موديلًا اسمه «لاند». */
  it('يطابق الاسم الأطول قبل الأقصر', () => {
    const chips = parseQuery('لاند كروزر ٢٠٢٢', VOCABULARY).chips;
    expect(value(chips, 'modelId')).toBe('m-land');
    expect(value(chips, 'yearFrom')).toBe(2022);
  });

  it('يفهم الإنجليزية والعربية معًا', () => {
    const chips = parseQuery('Nissan Altima 2021 جدة', VOCABULARY).chips;
    expect(value(chips, 'modelId')).toBe('m-altima');
    expect(value(chips, 'brandId')).toBe('b-nissan');
    expect(value(chips, 'city')).toBe('جدة');
  });

  it('يلتقط المواصفة ونوع البيع والفحص', () => {
    const chips = parseQuery('جيب دبل مفحوصة مزاد خليجي هايبرد', VOCABULARY).chips;
    expect(value(chips, 'bodyType')).toBe('SUV');
    expect(value(chips, 'drivetrain')).toBe('FOUR_WD');
    expect(value(chips, 'inspected')).toBe(true);
    expect(value(chips, 'type')).toBe('AUCTION');
    expect(value(chips, 'spec')).toBe('GCC');
    expect(value(chips, 'fuel')).toBe('HYBRID');
  });

  /**
   * **وما لم يُفهم يُقال.** محرّكٌ يبتلع كلمةً بلا إشارة يترك الزائر
   * يقرأ نتائج أوسع ممّا طلب وهو يحسبها أضيق.
   */
  it('يعيد ما لم يفهمه ولا يبتلعه', () => {
    const { chips, rest } = parseQuery('كامري بودي كت أحمر', VOCABULARY);
    expect(value(chips, 'modelId')).toBe('m-camry');
    expect(rest).toBe('بودي كت احمر');
  });

  it('لا يعدّ حروف الوصل عجزًا عن الفهم', () => {
    expect(parseQuery('أبغى سيارة في الرياض', VOCABULARY).rest).toBe('');
  });

  it('جملةٌ فارغة لا ترمي', () => {
    expect(parseQuery('', VOCABULARY)).toEqual({ chips: [], rest: '' });
    expect(parseQuery('   ', VOCABULARY)).toEqual({ chips: [], rest: '' });
  });

  /** **ولا تُسند قيمتان لحقلٍ واحد** — فآخرُ ما يُقرأ لا يُلغي أوّله صامتًا. */
  it('لا يكرّر حقلًا', () => {
    const { chips } = parseQuery('كامري ألتيما', VOCABULARY);
    expect(chips.filter((chip) => chip.field === 'modelId')).toHaveLength(1);
    expect(chips.filter((chip) => chip.field === 'brandId')).toHaveLength(1);
  });
});

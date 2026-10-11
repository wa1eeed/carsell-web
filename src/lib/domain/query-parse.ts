/**
 * ═══ الجملة تُفهم ═══
 *
 * شريط البحث في صدر الرئيسية يرسل `q`، **ولا شيء كان يقرؤه**: من
 * كتب «كامري ٢٠٢٠ مستعملة الرياض تحت ١٠٠ ألف» وضغط «ابحث» وصل إلى
 * الستّ والأربعين سيارة كلّها — وهو العدد نفسه الذي يصله من لم يكتب
 * شيئًا، ومن كتب حروفًا عشوائية. فأبرزُ عنصرٍ في الصفحة الأولى كان
 * زينة.
 *
 * والتصميم (Wb) لا يكتفي بالتطبيق: **يعرض ما فُهم** شاراتٍ تُحذف
 * واحدةً واحدة. وهذا الفارق هو كلّ شيء — محرّكٌ يُخمّن بلا أن يقول ما
 * خمّنه يترك الزائر أمام نتائج لا يعرف لِمَ هي هذه، فإن أخطأ لم يعرف
 * أين يصحّح.
 *
 * ═══ ولماذا الدالّة نقيّة ═══
 *
 * المفردات (الماركات والموديلات والمدن) تُمرَّر ولا تُقرأ هنا، فالمحلّل
 * يُختبَر بلا قاعدة: عشرون جملةً في ملفّ اختبارٍ يمرّ في أجزاء الثانية.
 * وهو السبب نفسه الذي يجعل تصحيح قاعدةٍ فيه لا يحتاج بيئة.
 */

import type { BodyType, Drivetrain, FuelType, ListingType, Transmission, VehicleCondition, VehicleSpec } from '@/generated/prisma/enums';
import {
  ABOVE, BELOW, FILLER, MILLION, NEWER, OLDER, SINCE, THOUSAND, UNTIL, WORDS, normalize, priceOf,
} from '@/lib/search/lexicon';

export { normalize };

/** أقدم سنةِ صنعٍ معقولة — وما دونها رقمٌ آخر لا سنة. */
const YEAR_FLOOR = 1970;
const YEAR_CEILING = new Date().getFullYear() + 2;

export type Vocabulary = {
  brands: readonly { id: string; names: readonly string[] }[];
  models: readonly { id: string; brandId: string; names: readonly string[] }[];
  cities: readonly string[];
};

/**
 * ما فُهم من الجملة — **قيمةٌ ومداها في النصّ**.
 *
 * والمدى ليس ترفًا: به يُعرف ما **لم** يُفهم، وبه تُحذف الشارة من
 * الجملة لا من الفلتر وحده.
 */
export type Chip =
  | { field: 'brandId'; value: string; text: string }
  | { field: 'modelId'; value: string; text: string }
  | { field: 'city'; value: string; text: string }
  | { field: 'condition'; value: VehicleCondition; text: string }
  | { field: 'transmission'; value: Transmission; text: string }
  | { field: 'fuel'; value: FuelType; text: string }
  | { field: 'bodyType'; value: BodyType; text: string }
  | { field: 'drivetrain'; value: Drivetrain; text: string }
  | { field: 'spec'; value: VehicleSpec; text: string }
  | { field: 'type'; value: ListingType; text: string }
  | { field: 'inspected'; value: true; text: string }
  | { field: 'yearFrom' | 'yearTo' | 'priceMin' | 'priceMax'; value: number; text: string };

export type ParsedQuery = {
  chips: Chip[];
  /** ما بقي من الجملة بلا فهم — يُعرض كما كتبه صاحبه */
  rest: string;
};

/* ═══════════════════ التطبيع ═══════════════════ */

/* ═══════════════════ المحلّل ═══════════════════ */

type Mark = { from: number; to: number };

/**
 * يفهم الجملة ويقول **ما فهمه وما لم يفهمه**.
 *
 * والترتيب مقصود: الموديل قبل الماركة (فـ«كامري» تدلّ على تويوتا بلا
 * أن تُذكر)، والأطول قبل الأقصر (فـ«لاند كروزر» لا تُقرأ «لاند»).
 */
export function parseQuery(text: string, vocabulary: Vocabulary): ParsedQuery {
  const source = normalize(text);
  if (source === '') return { chips: [], rest: '' };

  const words = source.split(' ');
  const marks: Mark[] = [];
  const chips: Chip[] = [];

  const free = (from: number, to: number): boolean =>
    !marks.some((mark) => from < mark.to && to > mark.from);

  /**
   * **ولا قيمتان لحقلٍ واحد.** «كامري ألتيما» موديلان، وإسنادُهما معًا
   * يُنتج فلترًا لا يطابق شيئًا — وشارتين متناقضتين يقرؤهما الزائر
   * على أنهما «أو». فالأوّل يفوز، والثاني يبقى في «لم نفهم» ظاهرًا.
   */
  const take = (from: number, to: number, chip: Omit<Chip, 'text'>): boolean => {
    if (!free(from, to)) return false;
    if (chips.some((taken) => taken.field === chip.field)) return false;
    marks.push({ from, to });
    chips.push({ ...chip, text: words.slice(from, to).join(' ') } as Chip);
    return true;
  };

  /** هل الكلمات من `at` تطابق هذه العبارة؟ */
  const phraseAt = (at: number, phrase: string): number => {
    const parts = phrase.split(' ');
    for (const [offset, part] of parts.entries()) {
      if (words[at + offset] !== part) return 0;
    }
    return parts.length;
  };

  /* ① الموديل ثمّ الماركة — والأطول أوّلًا */
  const named = [
    ...vocabulary.models.map((row) => ({ field: 'modelId' as const, id: row.id, names: row.names, brandId: row.brandId })),
    ...vocabulary.brands.map((row) => ({ field: 'brandId' as const, id: row.id, names: row.names, brandId: null })),
  ];

  const candidates = named
    .flatMap((row) => row.names.map((name) => ({ ...row, name: normalize(name) })))
    .filter((row) => row.name !== '')
    .sort((a, b) => b.name.split(' ').length - a.name.split(' ').length);

  for (const candidate of candidates) {
    for (let at = 0; at < words.length; at += 1) {
      const length = phraseAt(at, candidate.name);
      if (length === 0 || !free(at, at + length)) continue;
      if (!take(at, at + length, { field: candidate.field, value: candidate.id })) continue;
      /**
       * **والموديل يجرّ ماركته.** من كتب «كامري» قصد تويوتا كامري،
       * وفلترةٌ بالموديل وحده تمرّ — لكنّ الشارة تقول «كامري» ولا
       * تقول من صنعها، فيظنّ الزائر أن الماركة لم تُفهم.
       */
      if (candidate.field === 'modelId' && candidate.brandId !== null) {
        const already = chips.some((chip) => chip.field === 'brandId');
        if (!already) chips.push({ field: 'brandId', value: candidate.brandId, text: '' });
      }
      break;
    }
  }

  /* ② المدينة */
  for (const city of vocabulary.cities) {
    const name = normalize(city);
    for (let at = 0; at < words.length; at += 1) {
      const length = phraseAt(at, name);
      if (length === 0 || !free(at, at + length)) continue;
      take(at, at + length, { field: 'city', value: city });
      break;
    }
  }

  /* ③ كلمات المعجم */
  for (const entry of WORDS) {
    for (const word of [...entry.words].sort((a, b) => b.split(' ').length - a.split(' ').length)) {
      const name = normalize(word);
      let hit = false;
      for (let at = 0; at < words.length && !hit; at += 1) {
        const length = phraseAt(at, name);
        if (length === 0 || !free(at, at + length)) continue;
        take(at, at + length, entry.chip);
        hit = true;
      }
      if (hit) break;
    }
  }

  /* ④ الأرقام — سنةً أو سعرًا بحسب ما حولها */
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at] ?? '';
    if (!/^\d+$/.test(word) || !free(at, at + 1)) continue;

    const value = Number(word);
    const next = words[at + 1];
    const scaled = next !== undefined && (THOUSAND.test(next) || MILLION.test(next));

    /** السابق قد يكون كلمتين («أقل من») فيُقرأ الاثنان. */
    const beforeOne = at > 0 ? (words[at - 1] ?? '') : '';
    const beforeTwo = at > 1 ? `${words[at - 2] ?? ''} ${beforeOne}` : '';
    const has = (list: readonly string[]): boolean =>
      list.includes(beforeOne) || list.includes(beforeTwo);

    const after = next ?? '';
    const afterTwo = `${after} ${words[at + 2] ?? ''}`.trim();
    const suffix = (list: readonly string[]): boolean =>
      list.includes(after) || list.includes(afterTwo);

    const spanFrom = has(BELOW) || has(ABOVE)
      ? (list: readonly string[]): number => (list.includes(beforeTwo) ? at - 2 : at - 1)
      : (): number => at;
    const spanTo = scaled ? at + 2 : at + 1;

    /**
     * ═══ سنةٌ أم سعر؟ ═══
     *
     * الرقم وحده لا يقول، **والمضاعِف وحده يحسم**: «٢٠٢٠ ألف» سعرٌ
     * ولو كان في مدى السنوات. وما عداه فأربعُ خاناتٍ في مدى صنع
     * المركبات **سنةٌ دائمًا** — و«تحت ٢٠٢٠» عند من يشتري سيارةً
     * موديلٌ لا ثمن، فلا سيارة بألفَي ريال ولا من يطلب سقفًا بمليونين
     * يكتبه هكذا.
     *
     * (وأوّل صياغةٍ جعلت لفظ السعر يحسم، فقرأت «تحت ٢٠٢٠» سقفًا
     * بمليونين وعرضت الأغلى لمن طلب الأرخص.)
     */
    const looksLikeYear = !scaled && value >= YEAR_FLOOR && value <= YEAR_CEILING;

    if (looksLikeYear) {
      if (suffix(OLDER)) take(at, at + 2, { field: 'yearTo', value });
      else if (suffix(NEWER)) take(at, at + 2, { field: 'yearFrom', value });
      else if (has(BELOW)) take(spanFrom(BELOW), at + 1, { field: 'yearTo', value });
      else if (has(ABOVE)) take(spanFrom(ABOVE), at + 1, { field: 'yearFrom', value });
      else if (SINCE.includes(beforeOne)) take(at - 1, at + 1, { field: 'yearFrom', value });
      else if (UNTIL.includes(beforeOne)) take(at - 1, at + 1, { field: 'yearTo', value });
      else take(at, at + 1, { field: 'yearFrom', value });
      continue;
    }

    const amount = priceOf(word, next);
    if (has(BELOW)) take(spanFrom(BELOW), spanTo, { field: 'priceMax', value: amount });
    else if (has(ABOVE)) take(spanFrom(ABOVE), spanTo, { field: 'priceMin', value: amount });
    else take(at, spanTo, { field: 'priceMax', value: amount });
  }

  /**
   * **وما لم يُفهم يُقال.** محرّكٌ يبتلع كلمةً بلا إشارة يترك الزائر
   * يحسب أنها طُبّقت — فيقرأ نتائج أوسع ممّا طلب وهو يظنّها أضيق.
   * وحروفُ الوصل ليست عجزًا عن الفهم فتُطرح.
   */
  const rest = words
    .map((word, at) => (free(at, at + 1) && !FILLER.has(word) ? word : ''))
    .filter((word) => word !== '')
    .join(' ');

  return { chips, rest };
}

/** الشارات ⇐ فلاتر. و`text: ''` شارةٌ مشتقّة لا تُعرض. */
export function chipsToFilters(chips: readonly Chip[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const chip of chips) out[chip.field] = String(chip.value);
  return out;
}

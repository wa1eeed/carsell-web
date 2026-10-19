/**
 * ═══ قوالبُ النصّ التحريريّ — القرار ٢٦ ═══
 *
 * «قالب + متغيّرات، لا تحرير يدويّ لكل تركيبة (مستحيل الصيانة)»:
 * ستُّ تركيباتٍ من المدن والماركات تُنتج آلافَ الصفحات، فالنصُّ يُكتب
 * مرّةً بمتغيّراته وتملؤه كلُّ صفحة من بياناتها.
 *
 * **وهذا الملفُّ بلا `db` عمدًا**: شاشةُ التحرير تعاين حيًّا في
 * المتصفّح، ووحدةٌ تستورد `db` تجرّ Prisma إلى حزمة المتصفّح وتُسقط
 * البناء. (وقع مرّتين قبل أن تُعقد البوابة.)
 */

/**
 * ═══ والسطحُ لا يُعرَّف إلّا إن كانت له صفحةٌ تَصيّره ═══
 *
 * المخطّط يذكر `landing_city` في تعليقه، **ولا صفحةَ مدينةٍ في
 * المنتج**: المساران `browse/[city]/[brand]` و`.../[model]`. وسطحٌ
 * يُعرَّف بلا صفحةٍ هو «قيمةٌ في المخطّط بلا بابٍ يصلها» — الصنفُ
 * الذي وقع إحدى عشرة مرّة في هذا المستودع. فالأسطح ثلاثة لأنّ
 * الصفحات ثلاث.
 */
export const SEO_SURFACES = ['search', 'landing_brand', 'landing_model'] as const;

export type SeoSurface = (typeof SEO_SURFACES)[number];

export function isSeoSurface(value: string): value is SeoSurface {
  return (SEO_SURFACES as readonly string[]).includes(value);
}

/**
 * ═══ المتغيّراتُ هي ما تحسبه الصفحةُ لشريحتها هي ═══
 *
 * **ولا متوسّطَ سوقٍ فيها.** القرار ٢٦ يسمّي `PriceStat` مصدرًا
 * للمتغيّرات، ومفتاحُه `model × year × trim × city × mileageBucket`:
 * فمتوسّطٌ يُجمع عبر السنوات ليس «متوسّط سعر يوكن في جدة» بل خلطُ
 * موديل ٢٠١٥ بموديل ٢٠٢٤. وCLAUDE.md يسجّل هذه الكذبة بعينها —
 * «الوصفُ يُبنى من المُطابِق لا من المُدخَل» — فالسؤال رُفع إلى
 * المصمّم، والقائمة تبقى على ما تُطابقه الصفحة حرفًا.
 */
export const SEO_VARIABLES: Record<SeoSurface, readonly string[]> = {
  search: ['count'],
  landing_brand: ['brand', 'city', 'count', 'priceMin', 'priceMax', 'inspected'],
  landing_model: ['brand', 'model', 'city', 'count', 'priceMin', 'priceMax', 'inspected'],
};

/** نفسُ نمط `notification-text` — صيغةٌ واحدة للمتغيّر في المنصّة كلّها. */
const PLACEHOLDER = /\{([a-z][a-zA-Z0-9_]*)\}/g;

/** أسماءُ ما يستعمله النصّ — للشاشة ولفحص الحفظ. */
export function seoPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1] as string))];
}

/** ما كُتب في النصّ ولا تملؤه الصفحة — خطأٌ مطبعيّ يُفرِغ فقرةً بصمت. */
export function unknownPlaceholders(text: string, surface: SeoSurface): string[] {
  const known = SEO_VARIABLES[surface];
  return seoPlaceholders(text).filter((name) => !known.includes(name));
}

export type SeoValues = Record<string, string | null>;

/**
 * ═══ الفقرةُ تُحذف كاملةً أو تُطبع كاملة ═══
 *
 * القرار ٢٦: «إن كانت العيّنة أقل من ٨، **أخفِ الفقرة كاملة** — لا
 * تكتب متوسّطًا من ثلاث صفقات». وهذه القاعدةُ معمَّمة: متغيّرٌ بلا
 * قيمة يُسقط فقرته، ولا يُطبع فراغًا مكانه.
 *
 * فـ«٠ مفحوصة» و«بأسعار من إلى» يقرأهما القارئ عطلًا، **وصفحةُ
 * الهبوط هي ما يُفهرَس**: ما يُطبع فيها يبقى في نتائج البحث بعد
 * إصلاحه. وفقرةٌ غائبة أهونُ من فقرةٍ ناقصة.
 *
 * **ويخالف هذا معاينةَ قوالب الإشعار** عن قصد: هناك يبقى المتغيّرُ
 * ظاهرًا لأنّ المحرِّر يريد أن يرى ما كتبه، وهنا يقرأ النصَّ زائرٌ
 * لا محرِّر.
 */
export function renderSeo(text: string, values: SeoValues): string {
  const trimmed = text.trim();
  if (trimmed === '') return '';

  for (const name of seoPlaceholders(trimmed)) {
    const value = values[name];
    if (value === null || value === undefined || value === '') return '';
  }

  return trimmed.replace(PLACEHOLDER, (_whole, name: string) => values[name] as string);
}

/**
 * حدُّ وصفِ محرّكات البحث — **والمقدّمةُ تؤدّي الدورين**: فقرةٌ
 * يقرؤها الزائر و`<meta description>` في الوقت نفسه. فما تجاوزه
 * يُقتطع في نتيجة البحث بثلاث نقاط، والشاشةُ تُحذّر ولا تمنع:
 * الاقتطاع ليس خطأً، والقرار للمحرِّر.
 */
export const SEO_DESCRIPTION_LIMIT = 160;

/**
 * ═══ والعددُ لا يحكم المعدود ═══
 *
 * «{count} سيارة» تُخرج «3 سيارة» — وصوابُها «3 سيارات»، والعربية
 * لها ستُّ حالاتِ جمعٍ يُصيب النصُّ الثابت واحدةً منها. **والقالبُ
 * نصٌّ لا عنصر**، فلا يبلغه `<Quantity>` ولا ICU: الجملةُ تُصاغ فلا
 * يجاور الرقمُ معدودَه — «سيارات تويوتا المعروضة في الرياض: ٣».
 *
 * وهو درسُ رسائل الـToast نفسُه (البوابة ١٨) **في موضعٍ لا تبلغه
 * بوابة**: النصُّ في القاعدة يكتبه مشغّلٌ بلا مُصرِّف ولا لينت. فيُفحص
 * في موضعين: الشاشةُ تُنذر قبل الحفظ، واختبارٌ يقرأ الصفوفَ المزروعة.
 *
 * **والسعرُ ليس منها**: «97,000 ريال» صيغةُ العُملة المتّبعة، فإدخالُها
 * يجعل الفحصَ يُنذر على كل قالبٍ فيه سعر — وإنذارٌ كاذبٌ متكرّر
 * يُعطّل القياس أشدَّ من غيابه.
 */
export const SEO_COUNT_VARIABLES = ['count', 'inspected'] as const;

const COUNT_BEFORE_NOUN = new RegExp(
  `\\{(${SEO_COUNT_VARIABLES.join('|')})\\}\\s?[\\u0621-\\u064A]`,
  'g',
);

/** أسماءُ متغيّراتِ العدد التي يجاورها معدودٌ عربيّ في هذا النصّ. */
export function countBeforeNoun(text: string): string[] {
  return [...new Set([...text.matchAll(COUNT_BEFORE_NOUN)].map((match) => match[1] as string))];
}

import type { ProviderType } from '@/generated/prisma/enums';

/**
 * ═══ حقولُ الإنجاز — مخطّطٌ لكل صنف، ونموذجٌ واحد يرسمها ═══
 *
 * طلبُ المالك (٢٠٢٦-١٠-١٧): «لوحة مستقلّة للمزوّد … موحَّدة لجميع
 * المزوّدين بطريقةٍ ذكيّة وتشمل المزوّدين من نوع فاحصين حيث هناك حقول
 * للتعامل مع الفحص، **وإذا كان المزوّد نقل ملكيّة هناك حقول تناسبه
 * لتنفيذ الطلب وهكذا لباقي المزوّدين**».
 *
 * **والفرقُ بين الأصناف بياناتٌ لا شاشات.** مخطّطٌ لكل صنف يرسمه نموذجٌ
 * واحد ويتحقّق منه النطاق — وشاشةٌ لكل صنفٍ هي كيف تصير لوحةٌ سبعًا
 * تتباعد أوّل تعديل في إحداها.
 *
 * ═══ ولماذا أصلًا ═══
 *
 * ستّةُ أصناف كانت تُنهي **بلا حقلٍ واحد**: ناقلٌ يضغط «أنهِ» فلا نعلم
 * رقم البوليصة، ومؤمِّنٌ ينتهي ولا رقمَ وثيقة، وممولٌ لا نعرف قراره.
 * فيدفع العميل ويقرأ «اكتمل» ولا شيء يقول له ما وقع. وأسوأُ منه:
 * `form: 'INSPECTION'` كان **مكتوبًا ولا يُفرَض** — فالفاحص يُنهي بلا
 * تقرير، ويُعترف بالإيراد وتخرج الفاتورة ويُقبض المال **على فحصٍ لا
 * وجود له**.
 *
 * ═══ والمفاتيح لاتينية ═══
 *
 * الصياغة في `src/lib/labels/completion.ts` (البوابة ١٧)، فالنطاق لا
 * يعرف اللغة. والمخطّط **بلا `db`** ليقرأه النموذج في المتصفّح.
 */

/**
 * نوعُ الحقل — ومنه يُشتقّ المُدخَل وعمودُ التخزين والتحقّق.
 *
 * `LATIN` ليس `TEXT` بزخرفة: رقمُ بوليصةٍ أو وثيقةٍ أو لوحةٍ **يُنسخ من
 * مصدرٍ لاتينيّ ويُقارن خانةً بخانة**، فيلزمه `dir="ltr"` (قاعدة
 * الحقول في CLAUDE.md).
 */
export type CompletionFieldType =
  | 'TEXT'
  | 'LATIN'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'MONEY'
  | 'DATE'
  | 'SELECT';

export type CompletionField = {
  /** مفتاحٌ لاتينيّ — واسمُه المعروض في `labels/completion.ts` */
  key: string;
  type: CompletionFieldType;
  required: boolean;
  /** خياراتُ `SELECT` — مفاتيحُ أيضًا */
  options?: readonly string[];
  /**
   * شرطُ الظهور: يُطلب هذا الحقل حين يحمل حقلٌ آخر إحدى قيمٍ بعينها.
   *
   * فمبلغُ التمويل المعتمد لا معنى له على رفض، وطلبُه على كل قرارٍ
   * يُجبر المزوّد على كتابة صفرٍ كاذب.
   *
   * **وقيمةٌ واحدة لا تكفي**: كان الشرط `equals` فحُرمت «موافقة
   * مشروطة» من كل حقل — قرارٌ بلا مبلغٍ ولا قسطٍ **ولا موضعَ يُكتب
   * فيه الشرط نفسه**، وهو كلُّ معناها.
   */
  onlyWhen?: { key: string; oneOf: readonly string[] };
  /** حدُّ الطول للنصوص — والتخزين `Text` فالحدّ للصياغة لا للعمود */
  maxLength?: number;
  /**
   * ═══ وزمنُ التاريخ يُفحص ═══
   *
   * «تاريخ التسليم: غدًا» على طلبٍ **يُنهيه المزوّد الآن** كذبٌ لا خطأ
   * تنسيق — والعميلُ يقرؤه إثباتًا. و`FUTURE` لما يصحّ أن يكون آتيًا
   * وحده: نهايةُ سريان وثيقة تأمين.
   */
  when?: 'PAST' | 'FUTURE';
  /** ولا يسبق هذا الحقلُ ذاك — استلامٌ بعد تسليم، وسريانٌ ينتهي قبل أن يبدأ */
  notBefore?: string;
};

/** أقصرُ ما يُقبل في حقلٍ نصّيٍّ مطلوب — و«تم» ليست إنجازًا موصوفًا */
export const MIN_COMPLETION_TEXT = 2;

/** وأقصرُ ما يُقبل في الحقول الحرّة الطويلة */
export const MIN_COMPLETION_SUMMARY = 10;

/**
 * ═══ ونوعُ النموذج يُشتقّ من الصنف لا يُكتب مرّتين ═══
 *
 * `INSPECTION` له نموذجُه الخاصّ (شاشاتٌ وبنودٌ وصور)، وما عداه
 * مخطّطُ حقول. و`null` لخطوةٍ لا تسأل شيئًا.
 */
export type CompletionFormKind = 'INSPECTION' | 'FIELDS';

const NOTES: CompletionField = {
  key: 'notes',
  type: 'TEXTAREA',
  required: false,
  maxLength: 1000,
};

/**
 * ═══ المخطّطات ═══
 *
 * وهذه **مقترحةٌ منّي** على ما يلزم كلَّ صنفَ عملٍ فعلًا، ومسجَّلةٌ
 * سؤالًا للمالك في `docs/OPEN-QUESTIONS.md` ليُقرّها أو يبدّلها —
 * فإضافةُ حقلٍ أو حذفُه سطرٌ هنا لا شاشة.
 */
export const COMPLETION_FIELDS: Readonly<Record<ProviderType, readonly CompletionField[]>> = {
  /** الفحص — نموذجُه الخاصّ، فلا حقول هنا */
  INSPECTION: [],

  /**
   * ═══ نقلُ المركبة — والسطحة لا شركةَ شحنٍ عالمية ═══
   *
   * نقلُ السيارات بين المدن هنا سطحةٌ أو ناقلةٌ لا أسطولُ بوالص،
   * **فاسمُ السائق ولوحةُ الناقلة هما ما يُطمئن** صاحبَ سيارةٍ تمضي
   * ألف كيلومتر بلا أن يراها. والمطلوبُ قليلٌ عمدًا: من يملؤه واقفٌ
   * بجوار شاحنةٍ على هاتفه، وكلُّ حقلٍ زائد يُغري بالكذب فيه.
   */
  SHIPPING: [
    { key: 'carrier', type: 'TEXT', required: true, maxLength: 120 },
    { key: 'trackingNo', type: 'LATIN', required: true, maxLength: 60 },
    { key: 'pickedUpAt', type: 'DATE', required: true, when: 'PAST' },
    { key: 'deliveredAt', type: 'DATE', required: true, when: 'PAST', notBefore: 'pickedUpAt' },
    { key: 'receivedBy', type: 'TEXT', required: true, maxLength: 120 },
    { key: 'driverName', type: 'TEXT', required: false, maxLength: 120 },
    { key: 'truckPlate', type: 'LATIN', required: false, maxLength: 20 },
    /** **والعدّادُ عند التسليم دليلٌ** — سيارةٌ نُقلت لا تُقاد */
    { key: 'odometerKm', type: 'NUMBER', required: false },
    NOTES,
  ],

  /**
   * ═══ التأمين — والتحمّلُ شرطُ الشامل لا زينتُه ═══
   *
   * السوق صنفان: **ضدّ الغير** (إلزاميّ) و**شامل**. ورقمُ الوثيقة هو
   * ما يُطالَب به عند أوّل حادث، ومدّتُها ما يُذكّر بالتجديد.
   * **والتحمّل يُسأل عنه في كل شاملٍ** — من لا يعرفه يُفاجأ به يوم
   * الحادث، فيُطلب حيث يكون له معنى وحده.
   */
  INSURANCE: [
    { key: 'insurer', type: 'TEXT', required: true, maxLength: 120 },
    { key: 'policyNo', type: 'LATIN', required: true, maxLength: 60 },
    {
      key: 'coverage',
      type: 'SELECT',
      required: true,
      options: ['THIRD_PARTY', 'COMPREHENSIVE'],
    },
    { key: 'startsAt', type: 'DATE', required: true },
    { key: 'endsAt', type: 'DATE', required: true, when: 'FUTURE', notBefore: 'startsAt' },
    { key: 'premium', type: 'MONEY', required: true },
    {
      key: 'deductible',
      type: 'MONEY',
      required: true,
      onlyWhen: { key: 'coverage', oneOf: ['COMPREHENSIVE'] },
    },
    NOTES,
  ],

  /**
   * ═══ نقلُ الملكية — وقناةُ النقل تُقال ═══
   *
   * النقلُ يقع عبر **أبشر** أو **تم** أو في إدارة المرور، ولكلٍّ
   * مرجعُها وطريقةُ تتبّعها — فمشغّلٌ يُسأل «أين معاملتي؟» يحتاج
   * القناة قبل الرقم.
   *
   * **واللوحةُ تبقى مع المركبة ما لم تُغيَّر**، والمشتري يسأل عنها
   * أوّل شيء: أهي لوحتي أم لوحةُ من قبلي؟ فيُقال صراحةً.
   */
  TRANSFER: [
    {
      key: 'transferChannel',
      type: 'SELECT',
      required: true,
      options: ['ABSHER', 'TAM', 'TRAFFIC_DEPT'],
    },
    { key: 'transferNo', type: 'LATIN', required: true, maxLength: 60 },
    { key: 'transferredAt', type: 'DATE', required: true, when: 'PAST' },
    { key: 'newOwnerName', type: 'TEXT', required: true, maxLength: 160 },
    {
      key: 'plateStatus',
      type: 'SELECT',
      required: true,
      options: ['KEPT', 'CHANGED'],
    },
    { key: 'plateNo', type: 'LATIN', required: true, maxLength: 20 },
    { key: 'transferFees', type: 'MONEY', required: false },
    NOTES,
  ],

  /** التهيئة والتلميع — وما أُنجز وصفًا لا «تم» */
  DETAILING: [
    { key: 'workDone', type: 'TEXTAREA', required: true, maxLength: 1000 },
    { key: 'hours', type: 'NUMBER', required: false },
    NOTES,
  ],

  /** التصوير — والعددُ والرابط هما ما يُسلَّم */
  PHOTOGRAPHY: [
    { key: 'shotCount', type: 'NUMBER', required: true },
    { key: 'albumUrl', type: 'LATIN', required: true, maxLength: 500 },
    NOTES,
  ],

  /**
   * ═══ التمويل — ومبلغٌ ومدّةٌ ليسا قرارَ تمويلٍ في هذا السوق ═══
   *
   * ما يسأل عنه المشتري **الدفعة الأولى والقسط الشهري**، لا مبلغَ
   * التمويل وحده — وبهما يقرّر، وعليهما يقارن بين جهتين.
   *
   * **والعقدُ مرابحةٌ أو إجارةٌ منتهية بالتمليك**، وفرقُهما ليس
   * تفصيلًا: في الإجارة لا تُنقل الملكية إلّا بعد آخر قسط، فمن ظنّها
   * مرابحةً يُفاجأ بأنّ السيارة ليست باسمه.
   *
   * **ونسبةُ الربح لا «فائدة»** — والتسميةُ هنا ليست ذوقًا.
   *
   * **والدفعةُ الأخيرة تُقال متى وُجدت**: عقدٌ ينتهي بدفعةٍ كبيرة لا
   * يُقرأ من قسطه الشهريّ وحده.
   *
   * **و«مشروطة» كانت بلا حقلٍ واحد** — قرارٌ كلُّ معناه شرطُه، ولا
   * موضعَ يُكتب فيه.
   */
  FINANCE: [
    { key: 'lender', type: 'TEXT', required: true, maxLength: 120 },
    { key: 'applicationNo', type: 'LATIN', required: true, maxLength: 60 },
    {
      key: 'decision',
      type: 'SELECT',
      required: true,
      options: ['APPROVED', 'CONDITIONAL', 'REJECTED'],
    },
    {
      key: 'contractType',
      type: 'SELECT',
      required: true,
      options: ['MURABAHA', 'IJARA'],
      onlyWhen: { key: 'decision', oneOf: ['APPROVED', 'CONDITIONAL'] },
    },
    {
      key: 'approvedAmount',
      type: 'MONEY',
      required: true,
      onlyWhen: { key: 'decision', oneOf: ['APPROVED', 'CONDITIONAL'] },
    },
    {
      key: 'downPayment',
      type: 'MONEY',
      required: true,
      onlyWhen: { key: 'decision', oneOf: ['APPROVED', 'CONDITIONAL'] },
    },
    {
      key: 'monthlyInstalment',
      type: 'MONEY',
      required: true,
      onlyWhen: { key: 'decision', oneOf: ['APPROVED', 'CONDITIONAL'] },
    },
    {
      key: 'tenorMonths',
      type: 'NUMBER',
      required: true,
      onlyWhen: { key: 'decision', oneOf: ['APPROVED', 'CONDITIONAL'] },
    },
    {
      key: 'profitRatePct',
      type: 'NUMBER',
      required: true,
      onlyWhen: { key: 'decision', oneOf: ['APPROVED', 'CONDITIONAL'] },
    },
    {
      key: 'finalPayment',
      type: 'MONEY',
      required: false,
      onlyWhen: { key: 'decision', oneOf: ['APPROVED', 'CONDITIONAL'] },
    },
    {
      key: 'conditions',
      type: 'TEXTAREA',
      required: true,
      maxLength: 1000,
      onlyWhen: { key: 'decision', oneOf: ['CONDITIONAL'] },
    },
    {
      key: 'rejectionReason',
      type: 'TEXTAREA',
      required: true,
      maxLength: 1000,
      onlyWhen: { key: 'decision', oneOf: ['REJECTED'] },
    },
    NOTES,
  ],

  /** وما لا صنفَ له يوصف وصفًا — فلا يبقى الإنجاز بلا أثر */
  OTHER: [{ key: 'summary', type: 'TEXTAREA', required: true, maxLength: 1000 }, NOTES],
};

/**
 * أيُّ نموذجٍ يُطلب عند الإنجاز — **ومن مصدرٍ واحد**: الفحصُ له نموذجُه،
 * وكلُّ صنفٍ له حقولٌ يُطلب مخطّطُه، وصنفٌ بلا حقولٍ لا يسأل شيئًا.
 */
export function completionFormFor(type: ProviderType): CompletionFormKind | null {
  if (type === 'INSPECTION') return 'INSPECTION';
  return COMPLETION_FIELDS[type].length > 0 ? 'FIELDS' : null;
}

/**
 * ═══ الحقولُ المطلوبة فعلًا بالنظر إلى ما كُتب ═══
 *
 * شرطُ `onlyWhen` يُقرأ من **القيم المُدخَلة** لا من الصنف وحده، فحقلٌ
 * لا يظهر لا يُطلب — والشاشة والخادم يقرآن هذه الدالّة نفسها، وإلّا
 * فالشاشة تُخفي ما يرفضه الخادم.
 */
export function visibleFields(
  fields: readonly CompletionField[],
  values: Readonly<Record<string, string>>,
): CompletionField[] {
  return fields.filter(
    (field) =>
      field.onlyWhen === undefined ||
      field.onlyWhen.oneOf.includes(values[field.onlyWhen.key] ?? ''),
  );
}

/** والقائمةُ بالصنف — لمن يملك الصنف ولا يملك القائمة */
export function visibleFieldsOf(
  type: ProviderType,
  values: Readonly<Record<string, string>>,
): CompletionField[] {
  return visibleFields(COMPLETION_FIELDS[type], values);
}

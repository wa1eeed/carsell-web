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
   * شرطُ الظهور: يُطلب هذا الحقل حين يحمل حقلٌ آخر قيمةً بعينها.
   *
   * فمبلغُ التمويل المعتمد لا معنى له على رفض، وطلبُه على كل قرارٍ
   * يُجبر المزوّد على كتابة صفرٍ كاذب.
   */
  onlyWhen?: { key: string; equals: string };
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

  /** نقلُ المركبة — وما يُثبت أنها وصلت ومن استلمها */
  SHIPPING: [
    { key: 'carrier', type: 'TEXT', required: true, maxLength: 120 },
    { key: 'trackingNo', type: 'LATIN', required: true, maxLength: 60 },
    { key: 'pickedUpAt', type: 'DATE', required: true, when: 'PAST' },
    { key: 'deliveredAt', type: 'DATE', required: true, when: 'PAST', notBefore: 'pickedUpAt' },
    { key: 'receivedBy', type: 'TEXT', required: true, maxLength: 120 },
    { key: 'odometerKm', type: 'NUMBER', required: false },
    NOTES,
  ],

  /** التأمين — ورقمُ الوثيقة ومدّتُها هما ما يُطالِب به العميل غدًا */
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
    NOTES,
  ],

  /** نقلُ الملكية — واللوحةُ ورقمُ المعاملة هما الدليل */
  TRANSFER: [
    { key: 'transferNo', type: 'LATIN', required: true, maxLength: 60 },
    { key: 'plateNo', type: 'LATIN', required: true, maxLength: 20 },
    { key: 'transferredAt', type: 'DATE', required: true, when: 'PAST' },
    { key: 'newOwnerName', type: 'TEXT', required: true, maxLength: 160 },
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
   * التمويل — **والقرارُ أوّلُ ما يُسأل عنه**، وما بعده تابعٌ له:
   * مبلغٌ ومدّةٌ على موافقةٍ وحدها، وسببٌ على رفضٍ وحده.
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
      key: 'approvedAmount',
      type: 'MONEY',
      required: true,
      onlyWhen: { key: 'decision', equals: 'APPROVED' },
    },
    {
      key: 'tenorMonths',
      type: 'NUMBER',
      required: true,
      onlyWhen: { key: 'decision', equals: 'APPROVED' },
    },
    {
      key: 'rejectionReason',
      type: 'TEXTAREA',
      required: true,
      maxLength: 1000,
      onlyWhen: { key: 'decision', equals: 'REJECTED' },
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
    (field) => field.onlyWhen === undefined || values[field.onlyWhen.key] === field.onlyWhen.equals,
  );
}

/** والقائمةُ بالصنف — لمن يملك الصنف ولا يملك القائمة */
export function visibleFieldsOf(
  type: ProviderType,
  values: Readonly<Record<string, string>>,
): CompletionField[] {
  return visibleFields(COMPLETION_FIELDS[type], values);
}

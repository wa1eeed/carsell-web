/**
 * ═══ اسم المركبة بلغة القارئ ═══
 *
 * **و`Vehicle` يحفظ لقطةً عربية.** `brandName` و`modelName` و`trimName`
 * نصوصٌ تُكتب يوم الإضافة ولا تُقرأ من الكتالوج بعدها — وهو صحيح: اسمٌ
 * يتغيّر في الكتالوج لا يغيّر ما بِيع تحت اسمه القديم.
 *
 * **لكنّ اللقطة لغةٌ واحدة.** فصفحة `/en` كانت تعرض «جي إم سي سييرا
 * SLE» في العنوان وفي المسار وفي بطاقات البحث — وحولها «Home» و
 * «Browse cars». والقارئ الإنجليزيّ لا يعرف ماذا يقرأ.
 *
 * و`Brand.nameEn` و`Model.nameEn` موجودان في المخطّط منذ بُني، ولا
 * يقرؤهما أحدٌ للعرض. فهذه الدالّة تقرؤهما **حين تتوفّر العلاقة**،
 * وترجع إلى اللقطة حين لا تتوفّر — فلا تسقط شاشةٌ لم يُضف إليها `select`.
 *
 * **والفئة تبقى كما هي**: `trimName` رمزٌ لاتينيّ غالبًا (`SLE` · `AT4`)
 * ولا مقابلَ له في الكتالوج.
 */
export type TitleSource = {
  brandName: string;
  modelName: string;
  trimName?: string | null;
  brand?: { nameEn?: string | null } | null;
  model?: { nameEn?: string | null } | null;
  trim?: { nameEn?: string | null } | null;
};

function pick(snapshot: string, english: string | null | undefined, english_locale: boolean): string {
  if (!english_locale) return snapshot;
  return english !== undefined && english !== null && english !== '' ? english : snapshot;
}

/** الماركة وحدها — يقرؤها صفُّ المواصفات. */
export function brandLabel(vehicle: TitleSource, locale: string): string {
  return pick(vehicle.brandName, vehicle.brand?.nameEn, locale === 'en');
}

/** والطراز وحده — تقرؤه شريحة السوق وصفُّ المواصفات. */
export function modelLabel(vehicle: TitleSource, locale: string): string {
  return pick(vehicle.modelName, vehicle.model?.nameEn, locale === 'en');
}

export function vehicleTitle(vehicle: TitleSource, locale: string): string {
  const en = locale === 'en';
  const trim = vehicle.trimName;
  return [
    brandLabel(vehicle, locale),
    modelLabel(vehicle, locale),
    typeof trim === 'string' && trim !== '' ? pick(trim, vehicle.trim?.nameEn, en) : null,
  ]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' ');
}

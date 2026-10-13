/**
 * ═══ ألوان المركبات — جدولٌ لا خوارزمية ═══
 *
 * هنا لا في `src/lib/domain`: **البوابة ١٧ تمنع العربية في النطاق**،
 * واللون قيمةٌ تُخزَّن عربيةً في `Vehicle.colorExterior`.
 *
 * **وما لا مقابل له يسقط إلى المخزَّن**: اللون حقلٌ حرّ يكتبه البائع،
 * فلونٌ لم يُتوقَّع يُعرض كما كُتب ولا يختفي. وتُضاف ترجمتُه هنا حين
 * تُلاحَظ — كما تُضاف المدينة.
 */
const COLOUR_EN: Record<string, string> = {
  'أبيض': 'White',
  'أسود': 'Black',
  'فضّي': 'Silver',
  'فضي': 'Silver',
  'رمادي': 'Grey',
  'رماديّ': 'Grey',
  'أزرق': 'Blue',
  'بني': 'Brown',
  'بنّي': 'Brown',
  'أحمر': 'Red',
  'أخضر': 'Green',
  'ذهبي': 'Gold',
  'ذهبيّ': 'Gold',
  'بيج': 'Beige',
};

export function colourLabel(colour: string, locale: string): string {
  if (locale !== 'en') return colour;
  return COLOUR_EN[colour.trim()] ?? colour;
}

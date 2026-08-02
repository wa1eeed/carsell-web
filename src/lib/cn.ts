/**
 * دمج أصناف CSS. لا مكتبة — الحاجة سطران.
 * الترتيب محفوظ، فآخر صنف يفوز كما في CSS.
 */
export function cn(
  ...values: readonly (string | false | null | undefined)[]
): string {
  return values.filter((v): v is string => typeof v === 'string' && v !== '').join(' ');
}

import { toLatinDigits } from '@/lib/arabic';

/**
 * تطبيع رقم الجوال السعودي إلى E.164.
 *
 * يقبل ما يكتبه المستخدم فعلًا: `0512345678` · `+966512345678` ·
 * `966512345678` · `512345678`، بمسافات أو شرطات، وبأرقام عربية-هندية.
 * التخزين دائمًا `+9665XXXXXXXX` — صيغة واحدة في قاعدة البيانات
 * وإلا صار للمستخدم الواحد حسابان.
 */
export function normalizeSaudiPhone(input: string): string | null {
  const digits = toLatinDigits(input).replace(/[^\d+]/g, '');

  let national: string;
  if (digits.startsWith('+966')) national = digits.slice(4);
  else if (digits.startsWith('966')) national = digits.slice(3);
  else if (digits.startsWith('00966')) national = digits.slice(5);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;

  // الجوال السعودي: يبدأ بـ٥ ثم ثمانية أرقام
  if (!/^5\d{8}$/.test(national)) return null;

  return `+966${national}`;
}

/** للعرض في الواجهة: `+966 51 234 5678` — يُغلَّف بـ`bidi-ltr`. */
export function formatSaudiPhone(e164: string): string {
  const n = e164.replace('+966', '');
  return `+966 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}

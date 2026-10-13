import { toLatinDigits } from '@/lib/arabic';

/**
 * الجزء الوطنيّ ممّا كُتب — **تُقشَّر البادئة مرّةً واحدة**.
 *
 * نسخُها في كل مُطبِّع يجعل واحدًا يقبل `00966` والآخر لا، فيصير للرقم
 * الواحد صيغتان في القاعدة.
 */
function nationalPart(input: string): string {
  const digits = toLatinDigits(input).replace(/[^\d+]/g, '');

  if (digits.startsWith('+966')) return digits.slice(4);
  if (digits.startsWith('00966')) return digits.slice(5);
  if (digits.startsWith('966')) return digits.slice(3);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/**
 * تطبيع رقم **الجوال** السعودي إلى E.164 — وهو رقم الهوية.
 *
 * يقبل ما يكتبه المستخدم فعلًا: `0512345678` · `+966512345678` ·
 * `966512345678` · `512345678`، بمسافات أو شرطات، وبأرقام عربية-هندية.
 * التخزين دائمًا `+9665XXXXXXXX` — صيغة واحدة في قاعدة البيانات
 * وإلا صار للمستخدم الواحد حسابان.
 */
export function normalizeSaudiPhone(input: string): string | null {
  const national = nationalPart(input);

  // الجوال السعودي: يبدأ بـ٥ ثم ثمانية أرقام
  if (!/^5\d{8}$/.test(national)) return null;

  return `+966${national}`;
}

/**
 * ═══ ورقمُ المنشأة أرضيٌّ غالبًا ═══
 *
 * `normalizeSaudiPhone` للهوية: حسابٌ واحد لرقمٍ واحد، وإليه تصل رسالة
 * التحقّق — فجوّالٌ لا غير. أمّا رقمُ معرضٍ أو شركة فحصٍ فهو **رقم
 * المنشأة**، وأكثرُه أرضيّ: مَن يلصق «+966 11 234 5678» من ترويسة
 * السجلّ التجاريّ لم يخطئ، ورفضُه يصنع الخطأ الذي يظنّ أنه يمنعه.
 *
 * فيقبل الجوّال (٥XXXXXXXX) والأرضيّ بمفاتيح المناطق السعودية
 * (١١ الرياض · ١٢ مكة وجدة · ١٣ الشرقية · ١٤ المدينة وتبوك ·
 * ١٦ القصيم · ١٧ عسير) ثم سبعة أرقام.
 */
export function normalizeSaudiContactPhone(input: string): string | null {
  const national = nationalPart(input);

  if (/^5\d{8}$/.test(national)) return `+966${national}`;
  if (/^1[1234679]\d{7}$/.test(national)) return `+966${national}`;

  return null;
}

/** للعرض في الواجهة: `+966 51 234 5678` — يُغلَّف بـ`bidi-ltr`. */
export function formatSaudiPhone(e164: string): string {
  const n = e164.replace('+966', '');
  return `+966 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}

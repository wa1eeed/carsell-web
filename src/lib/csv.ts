/**
 * ═══ كتابةُ CSV — قاعدةٌ أمنيّةٌ تُكتب مرّة ═══
 *
 * كانت في `admin-reports-export.ts` وحده، ثمّ احتاجها تصديرُ لوحة
 * المعرض. **وقاعدةٌ أمنيّةٌ تُنسخ تتباعد أوّل تعديل** — فالنسخةُ
 * الثانية تبقى بلا حرس الصيغ أو بلا BOM، ولا مُصرِّفَ يشكو.
 */

/**
 * تهريب خليّة CSV.
 *
 * **والصيغة `=` و`+` و`-` و`@` في أوّل خليّة تُنفَّذ صيغةً** في Excel:
 * اسمٌ يبدأ بـ`=` يصير أمرًا. فتُسبق بفاصلة عليا — وهي حقنُ الصيغ
 * الذي يجعل ملفًّا مُصدَّرًا سلاحًا على من يفتحه.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);

  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  /**
   * **BOM في أوّل الملف.** ‏Excel على ويندوز يقرأ CSV بترميز النظام،
   * فتُعرض العربية حروفًا مشوّشة — والمستلم يظنّ التصدير معطوبًا.
   */
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

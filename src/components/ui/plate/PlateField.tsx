'use client';

import { LicensePlate } from './LicensePlate';
import { SAUDI_PLATE_LETTERS, normalizePlateNumbers } from '@/lib/plate';

/**
 * ═══ إدخالُ اللوحة — قوائمُ لا حقلُ نصّ ═══
 *
 * الحروفُ المعتمدة على لوحات المرور **سبعةَ عشرَ** لا غير. وحقلٌ حرّ
 * يقبل «غ» و«ث» ثمّ يردّها بعد الإرسال، والقائمةُ لا تعرض إلّا
 * المقبول — فلا يُكتب ما يُرفض. (مواصفة المالك: الإدخال ثلاث قوائم.)
 *
 * **وكلُّ قائمةٍ تُظهر العربيَّ ومقابلَه اللاتينيّ معًا**: الخريطة ليست
 * نقحرةً لغوية (ص→X، م→Z)، فمن يختار «ص» يحتاج أن يرى أنّها تُطبع
 * «X» على لوحته.
 *
 * **والخانةُ لا تُفتح قبل ما قبلها، وإفراغُها يُسقط ما بعدها** — فلا
 * تُبنى «ا _ ح» وهي ليست لوحةً صالحة.
 *
 * **واللوحةُ تُرسم تحت الحقول وهو يكتب**: يرى البائعُ ما سيُطبع لا ما
 * أدخله، فيُمسك الخطأ قبل النشر لا بعده.
 */
export function PlateField({
  letters,
  numbers,
  onLetters,
  onNumbers,
  label,
  hint,
}: {
  letters: string;
  numbers: string;
  onLetters: (next: string) => void;
  onNumbers: (next: string) => void;
  label: string;
  hint?: string;
}) {
  const chosen = Array.from(letters);

  const setAt = (index: number, value: string): void => {
    const next = [...chosen];
    if (value === '') {
      /** إفراغُ خانةٍ يُسقط ما بعدها — فلا تبقى فجوة. */
      onLetters(next.slice(0, index).join(''));
      return;
    }
    next[index] = value;
    onLetters(next.slice(0, index + 1).join(''));
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-2xs font-bold">{label}</span>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-3xs opacity-70">الحروف</span>
          <div className="flex gap-2">
            {[0, 1, 2].map((index) => {
              const value = chosen[index] ?? '';
              /** الخانةُ تُفتح بعد ما قبلها وحده. */
              const open = index === 0 || chosen[index - 1] !== undefined;
              return (
                <select
                  key={index}
                  value={value}
                  disabled={!open}
                  aria-label={`الحرف ${String(index + 1)}`}
                  onChange={(event) => setAt(index, event.target.value)}
                  className="w-20 rounded-md border border-line bg-bg px-2 py-2 text-sm disabled:opacity-65"
                >
                  <option value="">—</option>
                  {SAUDI_PLATE_LETTERS.map((entry) => (
                    <option key={entry.ar} value={entry.ar}>
                      {entry.ar} · {entry.en}
                    </option>
                  ))}
                </select>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-3xs opacity-70">الأرقام</span>
          {/*
            `dir="ltr"` — رقمٌ يُنسخ من استمارةٍ ويُقارن خانةً بخانة.
            **ويقبل العربية والفارسية ويطبّعها**: من يمنع اللصق يظنّ
            أنه يمنع الخطأ وهو يصنعه.
          */}
          <input
            dir="ltr"
            inputMode="numeric"
            value={numbers}
            maxLength={4}
            aria-label="أرقام اللوحة"
            onChange={(event) => onNumbers(normalizePlateNumbers(event.target.value))}
            className="font-num w-28 rounded-md border border-line bg-bg px-3 py-2 text-sm font-bold"
          />
        </div>
      </div>

      {hint === undefined ? null : (
        <p className="text-3xs leading-loose opacity-70">{hint}</p>
      )}

      {/* المعاينةُ تظهر حين تكتمل اللوحة — ونصفُ لوحةٍ لا يُعرض شكلًا. */}
      <div className="w-64 max-w-full">
        <LicensePlate letters={letters} numbers={numbers} size="fill" />
      </div>
    </div>
  );
}

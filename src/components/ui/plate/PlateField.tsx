'use client';

import { useId } from 'react';

import { FieldNote } from '@/components/ui/Field';
import { LicensePlate } from './LicensePlate';
import {
  SAUDI_PLATE_LETTERS,
  normalizeArabicLetters,
  normalizePlateNumbers,
} from '@/lib/plate';

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
  note,
}: {
  letters: string;
  numbers: string;
  onLetters: (next: string) => void;
  onNumbers: (next: string) => void;
  /**
   * عنوانُ المجموعة — **ويُحذف حين يسمّيها ما حولها**: قسمٌ عنوانُه
   * «لوحة المركبة» وفيه عنوانٌ ثانٍ بالنصّ نفسه يُقرأ عنوانين.
   */
  label?: string;
  hint?: string;
  /**
   * تنويهٌ فوق الخانات — **بالشكل الذي تلبسه بقيّةُ الحقول**
   * (`FieldNote`): ما يَحكم قرارَ الكتابة يُقرأ قبلها، وبلونٍ يُرى.
   */
  note?: string;
}) {
  /**
   * ═══ والمخزَّنُ يُطبَّع قبل أن يُوزَّع على الخانات ═══
   *
   * **المخزنُ أقدمُ من الحقل.** لوحاتُ البذرة مكتوبةٌ بمسافات («س ع
   * د»)، فتقسيمُها حرفًا حرفًا يضع المسافة في الخانة الثانية — فتُعرض
   * فارغةً والثالثةُ مملوءة: **لوحةٌ ينقصها حرفُها الأوسط** أمام
   * بائعٍ لم يلمس شيئًا، ولا رسالة. (وُجد وأنا أفتح استمارةَ بيعٍ
   * لسيارةٍ من «سياراتي».)
   *
   * وهي القاعدةُ نفسُها: الحقل يقبل كلّ صيغةٍ ويطبّعها — والمخزَّنُ
   * صيغةٌ كغيرها.
   */
  /** **والتنويه يُقرأ مع الخانات** — لا يبقى زينةً لمن يُبصر وحده. */
  const noteId = useId();

  const chosen = Array.from(normalizeArabicLetters(letters));

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

  const ready = chosen.length === 3 && numbers.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {label === undefined ? null : <span className="text-2xs font-bold">{label}</span>}

      {note === undefined ? null : <FieldNote id={noteId}>{note}</FieldNote>}

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
                  {...(note === undefined ? {} : { 'aria-describedby': noteId })}
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
            {...(note === undefined ? {} : { 'aria-describedby': noteId })}
            onChange={(event) => onNumbers(normalizePlateNumbers(event.target.value))}
            className="font-num w-28 rounded-md border border-line bg-bg px-3 py-2 text-sm font-bold"
          />
        </div>
      </div>

      {hint === undefined ? null : (
        <p className="text-3xs leading-loose opacity-70">{hint}</p>
      )}

      {/*
        ═══ الصفيحةُ تُرسم فارغةً، ويُكتب عليها وهو يختار ═══

        **ولوحٌ أبيضُ أصدقُ من مربّعٍ مكتوبٍ فيه «ستظهر هنا»**: الأوّل
        يُري البائعَ ما سيُطبع — المقاس والإطار والشعار وموضعَ كلّ
        خانة — فيمسك الخطأ قبل النشر. والثاني يَعِد بصورةٍ لا يراها.
        (طلب المالك ٢٠٢٦-١٠-١٨.)

        **والحبرُ يظهر بمفتاحٍ يتبدّل**: `key` على المحتوى يُعيد
        التركيب، فيُرى أنّ شيئًا كُتب الآن — بلا أن يقفز التخطيط.
      */}
      <div className="w-64 max-w-full">
        <div key={`${letters}-${numbers}`} className={ready ? 'plate-ink' : undefined}>
          <LicensePlate letters={letters} numbers={numbers} size="fill" blank />
        </div>
      </div>
    </div>
  );
}

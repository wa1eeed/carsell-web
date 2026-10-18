import Image from 'next/image';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import type { TrustMarkView } from '@/lib/domain/trust-marks';

/**
 * ═══ شريطُ العلامات — ولا يُزاحم ما تحته ═══
 *
 * **والشعارُ وحده بلا بطاقةٍ ولا اسمٍ تحته.** جرّبتُ بطاقةً بيضاء
 * تُسوّي خلفيّاتٍ مختلفة، فصارت أربعةَ صناديقَ تسحب العين؛ والأصحُّ
 * أن تُشفَّف الخلفيّاتُ في الملفّات نفسِها فيقف الشعارُ على الورق.
 * والأسماءُ تحتها حشوٌ: من يعرف الجهةَ يعرف شعارَها، ومن لا يعرفها
 * يبلغها بالنقر.
 *
 * **والاسمُ ينتقل إلى `alt`** — فلا يضيع على قارئ الشاشة بزوال النصّ.
 *
 * **والرقمُ حين يوجد**: وسمُ جهةٍ نظامية دعوى، ورقمُ التسجيل تحته
 * يجعلها قابلةً للتحقّق — وهو ما يفصل العلامةَ الجادّة من الصورة.
 */export function TrustMarks({
  marks,
  locale,
  title,
  note,
}: {
  marks: readonly TrustMarkView[];
  locale: string;
  title: string;
  /** سطرٌ يشرح ما تعنيه العلامات — فلا تُقرأ زينةً. */
  note?: string;
}) {
  if (marks.length === 0) return null;
  const isArabic = locale === 'ar';

  return (
    <section className="border-t border-line-2 pt-7">
      <p className="mb-5 text-3xs font-bold tracking-[0.14em] opacity-65">{title}</p>

      <ul className="flex flex-wrap items-center gap-x-10 gap-y-7">
        {marks.map((mark) => {
          const name = isArabic ? mark.nameAr : mark.nameEn;
          const body = (
            <>
              <Image
                src={mark.logoPath}
                alt={name}
                width={180}
                height={60}
                className="h-11 w-auto object-contain opacity-80 transition group-hover:opacity-100"
              />
              {mark.registrationNo === null ? null : (
                <span className="mt-1.5 block text-3xs opacity-65">
                  {/* رقمٌ يُقارن خانةً بخانة — معزولٌ لاتينيًّا */}
                  <span dir="ltr" className="font-num bidi-ltr">
                    <ArabicNumber value={mark.registrationNo} grouped={false} />
                  </span>
                </span>
              )}
            </>
          );

          return (
            <li key={mark.key}>
              {mark.verifyUrl === null ? (
                <span className="group -my-1 block py-1">{body}</span>
              ) : (
                /*
                  **ورابطٌ خارجيّ يُعلَن ويُؤمَّن**: `rel` يمنع الصفحةَ
                  المفتوحة من بلوغ نافذتنا، والعنوانُ يقول إلى أين.
                */
                <a
                  href={mark.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={name}
                  className="group -my-1 block py-1"
                >
                  {body}
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {note === undefined ? null : (
        <p className="mt-5 max-w-2xl text-3xs leading-loose opacity-65">{note}</p>
      )}
    </section>
  );
}

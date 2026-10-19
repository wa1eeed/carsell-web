import Image from 'next/image';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { cn } from '@/lib/cn';
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
  dense = false,
}: {
  marks: readonly TrustMarkView[];
  locale: string;
  title: string;
  /** سطرٌ يشرح ما تعنيه العلامات — فلا تُقرأ زينةً. */
  note?: string;
  /**
   * ═══ شريطُ الدفع يُقرأ صفًّا واحدًا ═══
   *
   * **وخمسةُ وسائلَ ليست أربعَ جهات.** الجهاتُ النظامية تُقرأ واحدةً
   * واحدة، ووسائلُ الدفع تُقرأ **جملةً**: «يقبل مدى وفيزا وماستركارد
   * وأبل باي وإس تي سي باي». فمسافاتُ الجهات الواسعة تفرّقها، والالتفافُ
   * على الهاتف يقسمها سطرين فتبدو قائمتين. (طلب المالك ٢٠٢٦-١٠-١٩.)
   *
   * فالمسافةُ تضيق، والصفُّ لا يلتفّ، والارتفاعُ يصغر على الهاتف حتى
   * تسعَ الخمسةُ في ٣٧٥px — لا بانكماشٍ يقصّها (`min-w-0` على عنصرٍ
   * مرن يحذف المحتوى، وقد وقع في المِلاحة).
   */
  dense?: boolean;
}) {
  if (marks.length === 0) return null;
  const isArabic = locale === 'ar';

  return (
    <section className="border-t border-line-2 pt-7">
      <p className="mb-5 text-3xs font-bold tracking-[0.14em] opacity-65">{title}</p>

      {/*
        ═══ والجهاتُ النظامية سطران على الهاتف لا ثلاثة ═══

        **والصفُّ المرن لا يَعِد بعدد.** `flex-wrap` يضع ما يتّسع، وأربعُ
        شعاراتٍ عريضة في ٣٧٥px تنزل **ثلاثةَ أسطر** — والتذييل يطول بلا
        أن يقول أحدٌ شيئًا. والشبكةُ تَعِد: عمودان ⇒ أربعةٌ في سطرين
        مهما اختلفت عروضُها. (طلب المالك ٢٠٢٦-١٠-١٩.)

        **والشعارُ يُصغَّر ولا يُقصّ**: `max-w-full` مع `object-contain`
        يُنقص ارتفاعَه داخل عموده — ولا يُحذف منه شيء.
      */}
      <ul
        className={cn(
          'items-center',
          dense
            ? 'flex flex-nowrap gap-x-3 sm:gap-x-5'
            : 'grid grid-cols-2 gap-x-6 gap-y-6 sm:flex sm:flex-wrap sm:gap-x-10 sm:gap-y-7',
        )}
      >
        {marks.map((mark) => {
          const name = isArabic ? mark.nameAr : mark.nameEn;
          const body = (
            <>
              <Image
                src={mark.logoPath}
                alt={name}
                width={180}
                height={60}
                className={cn(
                  'w-auto max-w-full object-contain opacity-80 transition group-hover:opacity-100',
                  dense ? 'h-6 sm:h-10' : 'h-9 sm:h-11',
                )}
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
            <li key={mark.key} className={dense ? 'min-w-0 shrink' : undefined}>
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

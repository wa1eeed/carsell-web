import { toArabicDigits } from '@/lib/arabic';
import { cn } from '@/lib/cn';

export type PlateSize = 'sm' | 'md' | 'lg';

/**
 * جدول تحويل حروف اللوحة السعودية إلى مكافئها اللاتيني.
 * سبعة عشر حرفًا فقط تُستعمل في اللوحات، والمكافئ ليس ترجمة
 * صوتية بل ترميز رسمي (م→Z و ص→X) — لذلك يُشتقّ هنا ولا يمرّره
 * المنادي، فلا مكان يخطئ فيه.
 */
const LATIN_LETTER: Readonly<Record<string, string>> = {
  أ: 'A', ا: 'A', ب: 'B', ح: 'J', د: 'D', ر: 'R', س: 'S', ص: 'X',
  ط: 'T', ع: 'E', ق: 'G', ك: 'K', ل: 'L', م: 'Z', ن: 'N', ه: 'H',
  ة: 'H', و: 'U', ي: 'V',
};

function toLatinLetters(letters: string): string {
  return [...letters.replace(/\s+/g, '')]
    .map((ch) => LATIN_LETTER[ch] ?? ch)
    .join(' ');
}

/**
 * المقاسات تتغيّر بالتناسب لا بتغيير البنية: عرض واحد لكل مقاس،
 * وكل ما بداخله بوحدة `em` منه. النسبة ٢٫٤:١ كاللوحة الحقيقية.
 *
 * هذه أرقام كائن واقعي لا سلّم تصميم — كما أن ألوانها ليست توكنات
 * الواجهة. المقاس الأساس هو المتغيّر الوحيد.
 */
const SIZE: Record<PlateSize, { width: number; base: number }> = {
  sm: { width: 82, base: 7 },
  md: { width: 120, base: 10 },
  lg: { width: 180, base: 15 },
};

const ASPECT = 2.4;
const FRAME = 2; // الإطار الخارجي
const DIVIDER = 1.5; // الفواصل الداخلية — نفس السواد لا رمادي

/**
 * اللوحة السعودية.
 *
 * **مستطيل أبيض واحد بشبكة خطوط سوداء.** لا خلفية رمادية ولا
 * تدرّج ولا ظلّ ولا حدّ لكل خلية: الخلية مساحة بيضاء يحدّها خطّ،
 * لا صندوق منفصل — وهذا ما يفرّق اللوحة عن رسمٍ لها.
 *
 * البنية: صفّان × عمودان، وشريط رأسي في الطرف الأيمن يفصله خطّ.
 *   · العمود الأيسر: الأرقام · العمود الأوسط: الحروف
 *   · الصفّ العلوي عربي والسفلي لاتيني
 *
 * `dir="ltr"` على المكوّن كله: ترتيب الأعمدة ثابت في اللوحة الحقيقية
 * ولا يتبع اتجاه الصفحة.
 *
 * الخط **Arial في الصفَّين** — العربي واللاتيني (القسم ٤).
 */
export function PlateBadge({
  letters,
  numbers,
  size = 'md',
  className,
}: {
  /** ثلاثة أحرف عربية، بمسافات أو بدونها: «أ ب ح» */
  letters: string;
  /** أربعة أرقام Latin للتخزين */
  numbers: string;
  size?: PlateSize;
  className?: string;
}) {
  const { width, base } = SIZE[size];
  const arabicLetters = [...letters.replace(/\s+/g, '')].join(' ');

  return (
    <span
      dir="ltr"
      className={cn('inline-flex overflow-hidden bg-plate-bg text-plate-ink', className)}
      style={{
        width,
        height: width / ASPECT,
        fontSize: base,
        border: `${FRAME}px solid var(--color-plate-ink)`,
        borderRadius: 'var(--radius-md)',
      }}
      role="img"
      aria-label={`${numbers} ${letters}`}
    >
      {/* الخلايا الأربع — الفواصل خطوط لا حدود صناديق */}
      <span className="flex flex-1 flex-col">
        <span className="flex flex-1">
          <Cell grow={1}>{toArabicDigits(numbers)}</Cell>
          <VLine />
          <Cell grow={1.15}>{arabicLetters}</Cell>
        </span>
        <HLine />
        <span className="flex flex-1">
          <Cell grow={1} latin>
            {numbers}
          </Cell>
          <VLine />
          <Cell grow={1.15} latin>
            {toLatinLetters(letters)}
          </Cell>
        </span>
      </span>

      {/* الشريط الرأسي في الطرف الأيمن، يفصله خطّ بنفس السماكة */}
      <VLine />
      <span
        className="flex flex-col items-center justify-between py-[0.15em]"
        style={{ width: '15%' }}
      >
        <Emblem />
        {/* تفصيل واقعي لا واجهة تُقرأ — يصغر حتى يتّسع بلا قصّ */}
        <span className="whitespace-nowrap" style={{ fontSize: '0.42em', lineHeight: 1 }}>
          السعودية
        </span>
        <span
          className="font-num flex flex-col items-center font-bold"
          style={{ fontSize: '0.42em', lineHeight: 1.05 }}
        >
          <span>K</span>
          <span>S</span>
          <span>A</span>
        </span>
        <span
          className="rounded-full bg-plate-ink"
          style={{ width: '0.3em', height: '0.3em' }}
        />
      </span>
    </span>
  );
}

/** فاصل عمودي بسماكة الفواصل الداخلية. */
function VLine() {
  return (
    <span
      className="shrink-0 self-stretch bg-plate-ink"
      style={{ width: DIVIDER }}
      aria-hidden
    />
  );
}

/** فاصل أفقي بين الصفّين. */
function HLine() {
  return (
    <span className="shrink-0 bg-plate-ink" style={{ height: DIVIDER }} aria-hidden />
  );
}

function Cell({
  children,
  latin = false,
  grow = 1,
}: {
  children: string;
  latin?: boolean;
  grow?: number;
}) {
  return (
    <span
      // Arial لكل محتوى اللوحة — الحروف العربية والأرقام معًا.
      // حروف اللوحة رموز منقوشة لا نصّ يُقرأ، فلا تأخذ خط المتن.
      className="font-num flex items-center justify-center overflow-hidden leading-none font-bold whitespace-nowrap"
      style={{
        flex: `${grow} 1 0`,
        // ثلاثة أحرف متباعدة أعرض من أربعة أرقام، فيصغر خطّها
        fontSize: latin ? '1.15em' : '1.25em',
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </span>
  );
}

/** شعار المملكة مبسّطًا — سيفان ونخلة. */
function Emblem() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="fill-plate-ink"
      style={{ width: '0.9em', height: '0.9em' }}
      aria-hidden
    >
      <path d="M4 15c2.6 1.7 5.3 2.6 8 2.6s5.4-.9 8-2.6l.9 1.3c-2.9 2-5.9 3-8.9 3s-6-1-8.9-3L4 15Z" />
      <path d="M3.4 11.2c.5 1.4 1.3 2.4 2.4 3l-.8 1.3c-1.5-.8-2.5-2.2-3.1-4.1l1.5-.2Zm17.2 0 1.5.2c-.6 1.9-1.6 3.3-3.1 4.1l-.8-1.3c1.1-.6 1.9-1.6 2.4-3Z" />
      <path d="M12 2c.6 1.4.4 2.6-.5 3.6.9.3 1.5.9 1.8 1.8.3-.9.9-1.5 1.8-1.8-.9-1-1.1-2.2-.5-3.6-1 .7-1.6 1.6-1.8 2.6C12.6 3.6 12.6 2.7 12 2Z" />
      <path d="M11.3 7.6h1.4v5h-1.4z" />
    </svg>
  );
}

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import {
  COMPLETION_FIELD,
  COMPLETION_OPTION,
  COMPLETION_UNIT,
} from '@/lib/labels/completion';

/**
 * ═══ إثبات الإنجاز كما يُقرأ ═══
 *
 * **والطرف الثاني يُبنى مع الأوّل**: مزوّدٌ يكتب رقم البوليصة ولا يراه
 * من دفع هو نصفُ ميزة. وصفحةُ الطلب كانت تقول «اكتمل» ولا شيء غيره —
 * فمن دفع ٩٠٠ ريالًا لنقل مركبته لا يعرف من استلمها ولا متى.
 *
 * وصدفةٌ واحدة لشاشتَي المزوّد والأدمن وصاحب الطلب: ثلاثُ نسخٍ تتباعد
 * أوّل حقلٍ يُضاف.
 */
export type CompletionRow = {
  key: string;
  text: string | null;
  number: string | null;
  date: string | null;
};

export function CompletionRecord({
  title,
  rows,
}: {
  title: string;
  rows: readonly CompletionRow[];
}) {
  if (rows.length === 0) return null;

  const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Riyadh',
  });

  return (
    <section className="rounded-xl border border-line">
      <h2 className="border-b border-line px-5 py-3.5 text-sm font-bold">{title}</h2>
      <dl>
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3.5 last:border-b-0"
          >
            <dt className="shrink-0 text-2xs opacity-70">
              {COMPLETION_FIELD[row.key] ?? row.key}
            </dt>
            <dd className="text-sm font-semibold">
              <Value row={row} format={date} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Value({
  row,
  format,
}: {
  row: CompletionRow;
  format: Intl.DateTimeFormat;
}) {
  if (row.date !== null) {
    /** والتاريخُ معزولٌ — وإلّا تبدّد ترتيبُه في مقطعٍ يرث RTL */
    return <span className="bidi-isolate">{format.format(new Date(row.date))}</span>;
  }

  if (row.number !== null) {
    const unit = COMPLETION_UNIT[row.key];
    /**
     * **والرقمُ بالعربية-الهندية مع فاصلة الآلاف** — و`ArabicNumber`
     * تفعل الاثنين، ونصٌّ خامٌّ لا يفعل أيًّا منهما.
     */
    return (
      <span>
        <ArabicNumber value={Number(row.number)} decimals={row.number.includes('.') ? 2 : 0} />
        {unit === undefined ? null : <span className="text-2xs opacity-70"> {unit}</span>}
      </span>
    );
  }

  const text = row.text ?? '—';
  /** وخيارُ القائمة مفتاحٌ — فيُصاغ، وإلّا قُرئ «COMPREHENSIVE» */
  const option = COMPLETION_OPTION[text];
  if (option !== undefined) return <span>{option}</span>;

  /**
   * **وما يُنسخ من مصدرٍ لاتينيّ يُعزل**: رقمُ بوليصةٍ أو لوحةٍ وسط
   * نصٍّ عربيّ تتبدّل خاناتُه بصريًّا، فيُقارن خانةً بخانة فيختلف.
   */
  const latin = /^[\x20-\x7E]+$/.test(text);
  return (
    <span className={latin ? 'bidi-isolate font-num whitespace-pre-wrap' : 'whitespace-pre-wrap'}>
      {text}
    </span>
  );
}

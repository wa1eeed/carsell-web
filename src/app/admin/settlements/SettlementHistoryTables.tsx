import { AR_DATE_LOCALE } from '@/lib/arabic';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import type {
  DepositRow,
  RefundedRow,
  SettledRow,
} from '@/lib/domain/settlement-queue';

/**
 * ═══ سجلّ ما خرج من الطابور ═══
 *
 * شرائح «مُسوّى» و«مُسترجَع» و«عرابين» كانت مؤجَّلةً بسببٍ مكتوب: لا
 * مصدر لها. وقد سقط السبب — فالإلغاء صار يُرجع، والعربون صار يمرّ
 * بالبوابة ويُحصَّل ويُصادَر.
 *
 * **وهذه قراءةٌ لا طابور**: لا زرّ فيها. ما خرج خرج، وزرٌّ على
 * معاملةٍ منتهية يَعِد بتراجعٍ لا يقع.
 */

const DEPOSIT_LABEL: Record<DepositRow['status'], { text: string; tone: 'accent' | 'warn' | 'neutral' }> = {
  HELD: { text: 'محجوز', tone: 'warn' },
  RELEASED: { text: 'رُدّ للمزايد', tone: 'neutral' },
  APPLIED: { text: 'خُصم من الطلب', tone: 'accent' },
  FORFEITED: { text: 'صودر للمنصّة', tone: 'warn' },
};

export function SettlementHistoryTables({
  settled,
  refunded,
  deposits,
  settledThisMonth,
  locale,
}: {
  settled: readonly SettledRow[];
  refunded: readonly RefundedRow[];
  deposits: readonly DepositRow[];
  settledThisMonth: string;
  locale: string;
}) {
  // التاريخ يُصاغ على الخادم — فلا يختلف ما يُقدَّم عمّا يُروى
  const date = new Intl.DateTimeFormat(locale === 'ar' ? AR_DATE_LOCALE : 'en-GB', {
    day: 'numeric',
    month: 'long',
  });

  if (settled.length === 0 && refunded.length === 0 && deposits.length === 0) return null;

  return (
    <>
      {settled.length === 0 ? null : (
        <Section
          title="مُسوّى"
          note={
            <>
              هذا الشهر <Money amount={Number(settledThisMonth)} decimals={2} />
            </>
          }
        >
          {settled.map((row) => (
            <Row
              key={row.orderRef}
              ref_={row.orderRef}
              main={row.seller}
              sub={`المشتري ${row.buyer}`}
              amount={row.amount}
              trailing={<span className="text-3xs opacity-65">{date.format(new Date(row.at))}</span>}
            />
          ))}
        </Section>
      )}

      {refunded.length === 0 ? null : (
        <Section title="مسترجع">
          {refunded.map((row) => (
            <Row
              key={row.orderRef}
              ref_={row.orderRef}
              main={row.buyer}
              /** **والسبب يُعرض** — مبلغٌ رُدّ بلا سببٍ لا يُراجَع. */
              sub={row.reason ?? 'بلا سبب مسجَّل'}
              amount={row.amount}
              trailing={<span className="text-3xs opacity-65">{date.format(new Date(row.at))}</span>}
            />
          ))}
        </Section>
      )}

      {deposits.length === 0 ? null : (
        <Section title="عرابين">
          {deposits.map((row, at) => (
            <Row
              key={`${row.auctionRef}-${String(at)}`}
              ref_={row.auctionRef}
              main={row.bidder}
              /**
               * **والدفتريّ القديم يُميَّز**: وسمٌ بلا مالٍ خلفه ليس
               * عربونًا، ومن يقرؤه مع أخيه يحسب المحجوز أكبر ممّا هو.
               */
              sub={row.hasPayment ? 'محجوز بالبوابة' : 'دفتريّ — بلا دفعة'}
              amount={row.amount}
              trailing={
                <Badge tone={DEPOSIT_LABEL[row.status].tone}>{DEPOSIT_LABEL[row.status].text}</Badge>
              }
            />
          ))}
        </Section>
      )}
    </>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9">
      <h2 className="mb-3 flex flex-wrap items-baseline gap-3 text-sm font-bold">
        {title}
        {note === undefined ? null : (
          <span className="text-3xs font-medium opacity-70">{note}</span>
        )}
      </h2>
      <div className="flex flex-col divide-y divide-line border-y border-line">{children}</div>
    </section>
  );
}

function Row({
  ref_,
  main,
  sub,
  amount,
  trailing,
}: {
  ref_: string;
  main: string;
  sub: string;
  amount: string;
  trailing: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {/* المرجع يُنسخ ويُقارن خانةً بخانة — لاتينيّ معزول */}
        <span dir="ltr" className="font-num text-start text-2xs opacity-70">
          {ref_}
        </span>
        <span className="bidi-isolate truncate text-sm">{main}</span>
        <span className="bidi-isolate truncate text-3xs opacity-65">{sub}</span>
      </div>
      <div className="flex items-center gap-6">
        <Money amount={Number(amount)} decimals={2} />
        {trailing}
      </div>
    </div>
  );
}

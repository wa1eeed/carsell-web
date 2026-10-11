import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Countdown } from '@/components/ui/Countdown';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import type { PublicAuction, ViewerStanding } from '@/lib/domain/auctions';
import { cn } from '@/lib/cn';

/**
 * ═══ نبض المزاد — تحت الصور مباشرةً ═══
 *
 * العدّاد والسعر كانا في العمود الجانبيّ وحده. وعلى الهاتف **يسقط
 * العمود تحت كل شيء**: المواصفات والسجلّ والشروط قبله — فمن يفتح
 * الرابط لا يرى كم بقي ولا بكم تُباع إلّا بعد تمريرٍ طويل.
 *
 * وهذان أعجلُ ما في الصفحة: **الوقت يجري**، والسعر يتحرّك.
 *
 * ═══ وشريطُ الوقت يُقرأ قبل الرقم ═══
 *
 * «٠٠:١٤:٠٥» رقمٌ يُقرأ حرفًا حرفًا. والشريط تحته يقول «قاربت النهاية»
 * بنظرةٍ واحدة — ويتلوّن بالتحذير في الساعة الأخيرة، فيُدرَك قبل أن
 * يُقرأ.
 */

/** الحدّ الذي يصير عنده المزاد عاجلًا — ساعة. */
const URGENT_MS = 3_600_000;

export function AuctionPulse({
  auction,
  live,
  standing,
  className,
}: {
  auction: PublicAuction;
  /** محسوبة من الحالة **والوقت** معًا — لا من الحالة وحدها. */
  live: boolean;
  /** `null` لزائرٍ لم يدخل أو لم يزايد. */
  standing: ViewerStanding | null;
  className?: string;
}) {
  const ends = new Date(auction.endsAt).getTime();
  const starts = new Date(auction.startsAt).getTime();
  const now = Date.now();

  const span = Math.max(1, ends - starts);
  const left = Math.max(0, ends - now);
  /** ما انقضى بالنسبة المئوية — ويُقصّ بين صفر ومئة فلا يفيض الشريط. */
  const elapsed = Math.min(100, Math.max(0, ((span - left) / span) * 100));
  const urgent = live && left <= URGENT_MS;

  const price = auction.highestBid ?? auction.startPrice;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border-2',
        urgent ? 'border-warn-900' : 'border-ink',
        className,
      )}
    >
      <div className="grid gap-px bg-line sm:grid-cols-2">
        {/* ═══ الوقت ═══ */}
        <div className="flex flex-col gap-2 bg-surface p-5">
          <span className="text-3xs opacity-55">
            {live ? 'يُغلق بعد' : 'انتهى المزاد'}
          </span>

          {live ? (
            <Countdown
              endsAt={auction.endsAt}
              format="full"
              tone={urgent ? 'warn' : 'plain'}
              className="text-3xl font-bold"
            />
          ) : (
            <span className="text-3xl font-bold opacity-45">—</span>
          )}

          {/*
            **والشريط يُرسم بصنفٍ لا بلونٍ مكتوب**، وعرضُه النسبة
            الوحيدة التي لا يمكن أن تُؤخذ من توكن — فهي بيانات لا تنسيق.
          */}
          <span
            aria-hidden
            className="mt-1 block h-1 overflow-hidden rounded-full bg-line"
          >
            <span
              className={cn('block h-full', urgent ? 'bg-warn-900' : 'bg-ink')}
              style={{ inlineSize: `${String(Math.round(elapsed))}%` }}
            />
          </span>

          <span className="text-3xs leading-loose opacity-50">
            يمتدّ{' '}
            <Quantity unit="minutes" count={Math.round(auction.terms.extendBySeconds / 60)} />{' '}
            مع أيّ مزايدة أخيرة
          </span>
        </div>

        {/* ═══ السعر ═══ */}
        <div className="flex flex-col gap-2 bg-surface p-5">
          <span className="text-3xs opacity-55">
            {auction.highestBid === null ? 'سعر الافتتاح' : 'أعلى مزايدة'}
          </span>

          <Money amount={Number(price)} size="lg" />

          <span className="flex flex-wrap items-center gap-2.5 text-3xs opacity-55">
            <span>
              <Quantity unit="bidders" count={auction.bidderCount} />
            </span>
            <span aria-hidden className="opacity-40">·</span>
            <span>
              <Quantity unit="bids" count={auction.bidCount} />
            </span>
          </span>

          {/*
            **والاحتياطيّ راية لا مبلغ** — القاعدة ٨: لا يخرج ولا ما
            يُشتقّ منه. و«بُلغ» تُقال لأنها تغيّر قرار المزايد.
          */}
          <span
            className={cn(
              'mt-1 w-fit rounded-full px-2.5 py-1 text-3xs font-bold',
              auction.reserveMet ? 'bg-accent-100 text-accent-800' : 'bg-line text-ink/70',
            )}
          >
            {auction.reserveMet ? 'بلغ السعر الاحتياطي' : 'لم يبلغ الاحتياطي بعد'}
          </span>
        </div>
      </div>

      {/*
        ═══ وسمُ موقفك ═══

        **ولا يُعرض لمن لم يزايد**: شريطٌ يقول «لم تزايد» يشغل موضعًا
        بلا معلومة. ومن زايد يحتاج جوابًا واحدًا قبل كل شيء: أما زلتُ
        الأعلى؟
      */}
      {standing === null || !standing.hasBid ? null : (
        <p
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-2xs font-bold',
            standing.top ? 'bg-accent text-bg' : 'bg-warn-900 text-bg',
          )}
        >
          <span className="flex items-center gap-2">
            <span aria-hidden className="text-base leading-none">
              {standing.top ? '●' : '○'}
            </span>
            {standing.top ? 'مزايدتك هي الأعلى' : 'تجاوزك مزايدٌ آخر'}
          </span>

          {standing.amount === null ? null : (
            <span className="font-num opacity-85">
              مزايدتك <ArabicNumber value={Number(standing.amount)} />
            </span>
          )}
        </p>
      )}
    </section>
  );
}

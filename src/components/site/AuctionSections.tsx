import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { toArabicDigits } from '@/lib/arabic';
import type { PublicAuction } from '@/lib/domain/auctions';

/**
 * ═══ أقسام صفحة المزاد التي رسمها التصميم ولم تُبنَ ═══
 *
 * We فيه تسع كتل، والمبنيّ كتلةٌ واحدة (سجلّ المزايدات) وعمودٌ جانبيّ.
 * فالزائر يرى مبالغ ولا يرى **ما هي المركبة** ولا **بأيّ شروطٍ يزايد**
 * ولا **كيف تحرّك المزاد** — ويُطلب منه أن يحجز خمسة آلاف ريال.
 */

/** شريط المواصفات تحت العنوان — أربع حقائق تسبق كل شيء. */
export function SpecStrip({
  items,
}: {
  /**
   * القيمة **عنصرٌ لا نصّ**: «٦٨٬٠٠٠ كم» مكتوبةً بيدٍ تُخرج جمعًا لا
   * يحكمه المعدود وتتخطّى `Quantity` — والبوابة تمنعها بحقّ.
   */
  items: readonly { label: string; value: React.ReactNode }[];
}) {
  return (
    <dl className="mb-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1.5 bg-surface p-4">
          <dt className="text-3xs opacity-50">{item.label}</dt>
          <dd className="bidi-isolate text-2xs font-bold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * ═══ إحصاءات السجلّ ═══
 *
 * أربعة أرقام تقول ما لا يقوله جدولٌ من ستّة صفوف: هل المزاد يتسارع،
 * ومتى تحرّك آخر مرّة، وكم مرّةً امتدّ.
 */
export function BidLogStats({ auction }: { auction: PublicAuction }) {
  const minutesSince =
    auction.lastBidAt === null
      ? null
      : Math.max(0, Math.round((Date.now() - new Date(auction.lastBidAt).getTime()) / 60_000));

  return (
    <dl className="mt-4 grid grid-cols-2 gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-4">
      <Stat label="سعر الافتتاح">
        <Money amount={Number(auction.startPrice)} showCurrency={false} size="sm" />
      </Stat>
      <Stat label="متوسّط الفرق بين مزايدتين">
        {auction.averageStep === null ? (
          <span className="text-2xs opacity-45">—</span>
        ) : (
          <Money amount={Number(auction.averageStep)} showCurrency={false} size="sm" />
        )}
      </Stat>
      <Stat label="آخر مزايدة">
        {minutesSince === null ? (
          <span className="text-2xs opacity-45">لا مزايدات</span>
        ) : minutesSince === 0 ? (
          /*
            **وأقلُّ من دقيقة تُقال بجملتها.** `Quantity` تصوغ الصفر
            «لا دقائق»، فيقرأ الزائر «آخر مزايدة قبل لا دقائق» — وهي
            اللحظة التي يكون فيها المزاد أشدَّ حياةً. (ثاني مرّة لهذا
            الصنف: وقع في مدّة مرحلة الطلب.)
          */
          <span className="text-2xs font-bold text-accent-700">الآن</span>
        ) : minutesSince < 60 ? (
          <span className="text-2xs font-bold">
            قبل <Quantity unit="minutes" count={minutesSince} />
          </span>
        ) : (
          <span className="text-2xs font-bold">
            قبل <Quantity unit="hours" count={Math.floor(minutesSince / 60)} />
          </span>
        )}
      </Stat>
      <Stat label="مرّات تمديد الوقت">
        <span className="font-num text-2xs font-bold">
          <ArabicNumber value={auction.extendedCount} grouped={false} />
        </span>
      </Stat>
    </dl>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-3xs opacity-50">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * ═══ شروط المزاد ═══
 *
 * **وكلّها أرقامٌ فعلية من الإعداد لا نصٌّ مكتوب في الشاشة.** شرطٌ
 * مكتوب بيدٍ يتباعد عن الإعداد أوّل تغيير، فيقرأ المزايد «٥ دقائق»
 * والنظام يمدّد ثلاثًا — وهو وعدٌ مُخلَف في مالٍ محجوز.
 */
export function AuctionTerms({ terms }: { terms: PublicAuction['terms'] }) {
  const rows: readonly { title: string; body: React.ReactNode }[] = [
    {
      title: 'عربون المزايدة',
      body: (
        <>
          يُحجز <Money amount={Number(terms.depositAmount)} size="sm" /> من محفظتك عند أوّل
          مزايدة، ويُرد فورًا إن لم تفز.
        </>
      ),
    },
    {
      title: 'التمديد التلقائي',
      body: (
        <>
          أيّ مزايدة في آخر{' '}
          <Quantity unit="minutes" count={Math.round(terms.extendWindowSeconds / 60)} /> تمدّد
          المزاد <Quantity unit="minutes" count={Math.round(terms.extendBySeconds / 60)} />.
        </>
      ),
    },
    {
      title: 'بعد الرسوّ',
      body: (
        <>
          <Quantity unit="hours" count={terms.paymentWindowHours} /> لسداد كامل المبلغ في حساب
          الضمان.
        </>
      ),
    },
    {
      title: 'المعاينة',
      body:
        terms.viewingCity === null && terms.viewingAddress === null ? (
          // غياب الموعد يُقال — ووعدُ معاينةٍ لا مكان لها أسوأ من صمت
          <>لم يحدّد البائع موقع معاينة لهذا المزاد.</>
        ) : (
          <>
            متاحة في{' '}
            <span className="bidi-isolate font-bold">
              {terms.viewingAddress ?? terms.viewingCity}
            </span>{' '}
            حتى ساعتين قبل الإغلاق.
          </>
        ),
    },
  ];

  return (
    <section className="mt-8">
      <h2 className="mb-3.5 text-base font-bold">شروط المزاد</h2>
      <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.title} className="flex flex-col gap-1.5 bg-surface p-4.5">
            <dt className="text-2xs font-bold">{row.title}</dt>
            <dd className="text-2xs leading-loose opacity-70">{row.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** حالة المزايدة — الأعلى · تم تجاوزها. والتلقائية تُميَّز بنوعها. */
export function BidStatus({ top, isAuto }: { top: boolean; isAuto: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {top ? <Badge tone="accent">الأعلى</Badge> : <Badge tone="neutral">تم تجاوزها</Badge>}
      {isAuto ? <span className="text-3xs opacity-50">تلقائية</span> : null}
    </span>
  );
}

/** الفرق عن سابقتها — بإشارة زائد صريحة، وهي زيادةٌ دائمًا. */
export function BidStep({ step }: { step: string | null }) {
  if (step === null) return <span className="opacity-35">—</span>;
  return (
    <span className="font-num text-3xs text-accent-700" dir="ltr">
      +{toArabicDigits(step)}
    </span>
  );
}

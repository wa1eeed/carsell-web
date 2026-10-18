import Link from 'next/link';
import { Dwell } from '@/components/admin/Dwell';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import type { OrderRow } from '@/lib/domain/admin-orders';
import { orderStateLabel } from '@/lib/labels/orders';
import { AR_DATE_LOCALE } from '@/lib/arabic';

/**
 * ═══ كرتُ الطلب ═══
 *
 * كان صفًّا في جدول: مرجعٌ ومرحلةٌ ومدّةٌ ومبلغٌ واسمان. **ومن يراجع
 * طلبًا متعثّرًا يحتاج أن يعرف قبل أن يفتحه** — أيُّ مركبةٍ هي، وأطرفٌ
 * موثَّقان أم لا (وهو أوّل ما يُسأل في نزاع)، وأمحجوزٌ مالُها في الضمان
 * أم لم يصل بعد.
 *
 * وهو أخو `ListingCard` بالبنية نفسها: غلافٌ ثم هويّةٌ ثم طرفان ثم
 * أرقام — **فالشاشتان تُقرآن بالعين نفسها**، وتعديلُ إحداهما يُرى في
 * الأخرى فلا تتباعدان.
 */


const SOURCE: Record<string, string> = {
  DIRECT: 'بيع مباشر',
  OFFER: 'قبول عرض',
  AUCTION: 'رسو مزاد',
  BUY_NOW: 'اشتر الآن',
};

/**
 * حالةُ الضمان — **وهي السؤال الأوّل في أيّ طلبٍ متعثّر**: أوصل المال
 * أم لا. وكانت تُعرف بفتح الطلب.
 */
const ESCROW: Record<string, { label: string; tone: 'accent' | 'warn' | 'neutral' }> = {
  PENDING: { label: 'الضمان بانتظار الدفع', tone: 'warn' },
  HELD: { label: 'المال محجوز', tone: 'accent' },
  RELEASED: { label: 'أفرج للبائع', tone: 'neutral' },
  REFUNDED: { label: 'رد للمشتري', tone: 'neutral' },
  /*
    **والخامسةُ تُعدّ.** `EscrowStatus` خمسٌ لا أربع، وغيابُ
    `PARTIAL_REFUND` من الجدول يجعل الكرت يصمت عن طلبٍ رُدّ نصفُ
    مالِه — وهو أحوجُ ما يُقال.
  */
  PARTIAL_REFUND: { label: 'رد جزء منه', tone: 'warn' },
};

const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

export function OrderCard({ row }: { row: OrderRow }) {
  const escrow = row.escrowStatus === null ? null : ESCROW[row.escrowStatus];
  /** الصياغة من `labels/orders` — قاعدةٌ واحدة تقرؤها اللوحة كلُّها. */
  const state = orderStateLabel(row.status, row.stage);

  return (
    /*
      ═══ الكرتُ حاويةٌ، والمرجعُ رابطٌ يمتدّ فوقه ═══

      كان الكرت كلُّه `<Link>`. ورابطٌ داخل رابطٍ **لا يصحّ في HTML** —
      فاسمُ المشتري لا يستطيع أن يفتح ملفّه ما دام داخله.

      والحلّ المعروف: الحاوية `relative`، ورابطُ المرجع يُمدّد بـ
      `after:absolute after:inset-0` فيغطّيها — **فالنقر في أيّ موضعٍ
      فارغ يفتح الطلب كما كان** — وما بداخلها من روابط يرتفع فوقه
      بـ`relative z-10`. فلا تعشيش، وكلُّ رابطٍ حقيقيّ: يُفتح بلوحة
      المفاتيح وبالزرّ الأوسط وفي تبويبةٍ جديدة.
    */
    <div className="group relative flex gap-4 rounded-xl border border-line bg-surface p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-ink/8">
        {row.thumbnail === null ? (
          <span className="flex size-full items-center justify-center text-3xs opacity-65">
            لا صور
          </span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- مفتاحُ R2 لا يمرّ بمحسّن الصور */
          <img
            src={row.thumbnail}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* المرجع يُنسخ ويُقارن خانةً بخانة — لاتينيّ معزول */}
          <Link
            href={`/admin/orders/${encodeURIComponent(row.ref)}`}
            dir="ltr"
            className="font-num text-start text-xs font-bold after:absolute after:inset-0 after:content-['']"
          >
            {row.ref}
          </Link>
          <Badge tone={state.tone}>{state.text}</Badge>
          {row.hasDispute ? <Badge tone="danger">نزاع مفتوح</Badge> : null}
          {escrow === undefined || escrow === null ? null : (
            <Badge tone={escrow.tone}>{escrow.label}</Badge>
          )}
        </div>

        <span className="truncate text-2xs opacity-75">
          <span className="bidi-isolate">{row.vehicle}</span>
          <span aria-hidden className="mx-1.5 opacity-40">
            ·
          </span>
          <span className="bidi-isolate">{row.city}</span>
          <span aria-hidden className="mx-1.5 opacity-40">
            ·
          </span>
          {SOURCE[row.source] ?? row.source}
        </span>

        {/*
          ═══ الطرفان وتوثيقُهما ═══

          **وهو أوّل ما يُسأل في نزاع**: أموثَّقٌ من يدّعي؟ وكان يُعرف
          بفتح الطلب ثم فتح كلّ طرفٍ على حدة.
        */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-3xs opacity-70">
          {/*
            **والطرفان يُفتحان من هنا.** وكرتُ الطلب رابطٌ بكامله، فلا
            يُعشَّش رابطٌ في رابط: هذان `span` يحملان الوجهة ويوقفان
            انتشار النقر — ولولا ذلك لفتح اسمُ المشتري **الطلبَ**.
          */}
          {/* **والطرفان رابطان حقيقيّان** — فوق الرابط الممدود لا داخله */}
          <PartyOnCard id={row.buyerId} name={row.buyer} verified={row.buyerVerified} />
          <span aria-hidden className="opacity-40">
            ←
          </span>
          <PartyOnCard id={row.sellerId} name={row.seller} verified={row.sellerVerified} />
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Money amount={Number(row.total)} size="sm" showCurrency={false} className="font-bold" />

        {/*
          **والمدّة تُصاغ ولا تُعرض نسبةً عارية.** كانت «120 / 2,037»
          بلا تسمية — ويُرسم الهدفُ يمينًا في RTL فتُقرأ معكوسةً:
          «١٢٠ من أصل ٢٬٠٣٧» عن طلبٍ مكث ٢٬٠٣٧ وهدفُه ١٢٠.
        */}
        <Dwell
          hours={row.dwellHours}
          targetHours={row.targetHours}
          className="text-3xs opacity-70"
        />

        {row.critical ? (
          <Badge tone="danger">متأخر جدا</Badge>
        ) : row.late ? (
          <Badge tone="warn">متأخر</Badge>
        ) : null}

        <span className="font-num text-3xs opacity-65">{date.format(new Date(row.createdAt))}</span>
      </div>
    </div>
  );
}

/** طرفٌ على الكرت — رابطٌ يرتفع فوق الرابط الممدود. */
function PartyOnCard({
  id,
  name,
  verified,
}: {
  id: string;
  name: string;
  verified: boolean;
}) {
  return (
    <>
      <Link
        href={`/admin/users/${encodeURIComponent(id)}`}
        className="bidi-isolate relative z-10 underline decoration-dotted underline-offset-4 hover:decoration-solid"
      >
        {name}
      </Link>
      {verified ? null : <span className="text-warn-900">بلا توثيق</span>}
    </>
  );
}

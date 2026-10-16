import Link from 'next/link';
import { Duration } from '@/components/ui/Duration';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { DISPUTE_STATUS_LABEL, RESOLUTION_LABEL } from '@/lib/labels/admin';
import type { DisputeRow } from '@/lib/domain/disputes';

/**
 * ═══ كرتُ النزاع ═══
 *
 * كان صفًّا في جدول: مرجعٌ وسببٌ ومبلغٌ وحالةٌ وعدد رسائل. **ولم يكن
 * يقول من الطرفان** — وأوّل سؤالٍ في نزاع: من يشكو، ومن المشكوّ منه،
 * وأموثَّقان هما. وكان الجواب يحتاج فتح النزاع ثم الطلب ثم كلّ طرف.
 *
 * وهو أخو `OrderCard` و`UserCard` بالبنية نفسها: غلافٌ ثم هويّةٌ ثم
 * طرفان ثم أرقام — فالشاشات الثلاث تُقرأ بالعين نفسها.
 *
 * ═══ والمهلة تُعدّ لا تُعلَن انقضاءً ═══
 *
 * الصفّ كان يقول «فاتت المهلة» أو لا يقول شيئًا. **وبين الحالين كلُّ
 * ما يهمّ**: نزاعٌ بقيت له ثلاث ساعات يُقدَّم على نزاعٍ بقي له يومان،
 * والجدول كان يسوّيهما.
 */

/** المنتهية — والحسم لصالح أحدهما حالتان لا حالة. */
const SETTLED: readonly string[] = ['RESOLVED_BUYER', 'RESOLVED_SELLER', 'CLOSED'];

/**
 * حالة الضمان — **وهي السؤال الثاني في النزاع**: أما زال المال عندنا؟
 * فنزاعٌ على طلبٍ أُفرج مالُه يُعالَج بغير ما يُعالَج به المحجوز.
 */
const ESCROW: Record<string, { label: string; tone: 'accent' | 'warn' | 'neutral' }> = {
  PENDING: { label: 'لم يُدفع بعد', tone: 'warn' },
  HELD: { label: 'المال محجوز', tone: 'accent' },
  RELEASED: { label: 'أُفرج للبائع', tone: 'neutral' },
  REFUNDED: { label: 'رُدّ للمشتري', tone: 'neutral' },
  PARTIAL_REFUND: { label: 'رُدّ جزءٌ منه', tone: 'warn' },
};

export function DisputeCard({
  row,
  children,
}: {
  row: DisputeRow;
  /** أزرار القرار — تُبنى في العميل، والكرت لا يعرف عنها شيئًا. */
  children?: React.ReactNode;
}) {
  const settled = SETTLED.includes(row.status);
  const escrow = row.escrowStatus === null ? null : ESCROW[row.escrowStatus];

  return (
    /*
      الكرت حاوية، ورابط المرجع يمتدّ فوقها بـ`after:inset-0` — فالنقر
      في أيّ موضعٍ فارغ يفتح النزاع، وما بداخلها من روابط وأزرار يرتفع
      فوقه بـ`relative z-10`. ورابطٌ داخل رابطٍ لا يصحّ.
    */
    <div className="group relative flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none sm:flex-row sm:items-start sm:gap-4">
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
            href={`/admin/disputes/${encodeURIComponent(row.id)}`}
            dir="ltr"
            className="font-num text-start text-xs font-bold after:absolute after:inset-0 after:content-['']"
          >
            {row.orderRef}
          </Link>
          <Badge size="sm" tone={settled ? 'accent' : row.overdue ? 'danger' : 'warn'}>
            {DISPUTE_STATUS_LABEL[row.status] ?? row.status}
          </Badge>
          {escrow === undefined || escrow === null ? null : (
            <Badge size="sm" tone={escrow.tone}>
              {escrow.label}
            </Badge>
          )}
        </div>

        <span className="truncate text-2xs opacity-75">
          <span className="bidi-isolate">
            {row.vehicleBrand} {row.vehicleModel}
          </span>
          <span aria-hidden className="mx-1.5 opacity-40">
            ·
          </span>
          <span className="font-num">{row.vehicleYear}</span>
        </span>

        {/* السبب كما كتبه صاحبه — ولا يُقصّ إلى سطرٍ واحد فيضيع معناه */}
        <p className="line-clamp-2 text-2xs leading-relaxed opacity-85">{row.reason}</p>

        {/*
          ═══ من يشكو ومن المشكوّ منه ═══

          **والسهم يقول الاتّجاه**: الشاكي أوّلًا. ومن لا توثيق له
          يُعلَّم، فهو أوّل ما يُسأل عنه في النزاع.
        */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-3xs opacity-70">
          <span className="opacity-70">{row.openedByBuyer ? 'فتحه المشتري' : 'فتحه البائع'}</span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <Party
            id={row.openedByBuyer ? row.buyerId : row.sellerId}
            name={row.openedByBuyer ? row.buyerName : row.sellerName}
            verified={row.openedByBuyer ? row.buyerVerified : row.sellerVerified}
          />
          <span aria-hidden className="opacity-40">
            ←
          </span>
          <Party
            id={row.openedByBuyer ? row.sellerId : row.buyerId}
            name={row.openedByBuyer ? row.sellerName : row.buyerName}
            verified={row.openedByBuyer ? row.sellerVerified : row.buyerVerified}
          />
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
        <Money amount={Number(row.orderTotal)} size="sm" showCurrency={false} className="font-bold" />

        {row.resolution === null ? null : (
          <span className="text-3xs opacity-70">
            {RESOLUTION_LABEL[row.resolution] ?? row.resolution}
            {row.resolutionAmount === null ? null : (
              <>
                <span aria-hidden className="mx-1 opacity-40">
                  ·
                </span>
                <Money amount={Number(row.resolutionAmount)} size="sm" showCurrency={false} />
              </>
            )}
          </span>
        )}

        <Sla row={row} settled={settled} />

        <span className="text-3xs opacity-65">
          <Quantity unit="messages" count={row.messageCount} />
        </span>

        {children === undefined ? null : (
          <span className="relative z-10 mt-1">{children}</span>
        )}
      </div>
    </div>
  );
}

/**
 * ═══ المهلة — والمتأخّر يُسمّى بتأخّره ═══
 *
 * «فاتت المهلة» لا تقول كم فاتت: نزاعٌ تأخّر ساعتين ونزاعٌ تأخّر
 * أسبوعًا يستويان في العبارة ولا يستويان في الخطر.
 */
function Sla({ row, settled }: { row: DisputeRow; settled: boolean }) {
  if (settled) {
    return (
      <span className="text-3xs opacity-65">
        <span className="opacity-70">استغرق </span>
        <Duration hours={row.hoursOpen} />
      </span>
    );
  }

  if (row.overdue) {
    return (
      <span className="text-3xs font-bold text-danger">
        <span className="opacity-80">تأخّر </span>
        <Duration hours={Math.abs(row.hoursToSla)} />
      </span>
    );
  }

  /** قُربُ الانقضاء يُلوَّن — ويومٌ واحد هو حدُّ ما يُفسح للمراجعة. */
  const near = row.hoursToSla <= 24;
  return (
    <span className={near ? 'text-3xs font-bold text-warn-900' : 'text-3xs opacity-65'}>
      <span className="opacity-80">بقي </span>
      <Duration hours={row.hoursToSla} />
    </span>
  );
}

/** طرفٌ على الكرت — رابطٌ يرتفع فوق الرابط الممدود. */
function Party({ id, name, verified }: { id: string; name: string; verified: boolean }) {
  return (
    <>
      <Link
        href={`/admin/users/${encodeURIComponent(id)}`}
        className="bidi-isolate relative z-10 underline decoration-dotted underline-offset-4 hover:decoration-solid"
      >
        {name === '' ? 'بلا اسم' : name}
      </Link>
      {verified ? null : <span className="text-warn-900">بلا توثيق</span>}
    </>
  );
}

import Link from 'next/link';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import type { UserRow } from '@/lib/domain/admin-orders';
import { AR_DATE_LOCALE } from '@/lib/arabic';

/**
 * ═══ كرت العميل ═══
 *
 * كان صفًا في جدول: اسم وآخر أربعة من الجوال وحالة وعددان. ومن يراجع
 * حسابًا يحتاج أن يعرف قبل أن يفتحه — **أفرد هو أم معرض**، وأموثق،
 * ومتى انضم، وهل باع فعلًا أم نشر ولم يبع.
 *
 * وهو أخو `ListingCard` و`OrderCard` بالبنية نفسها: هوية ثم صفة ثم
 * أرقام — فالشاشات الثلاث تُقرأ بالعين نفسها.
 */

/**
 * التصنيف — **والمعارض لم تُبن لوحتها بعد**، فكل من على المنصة اليوم
 * فرد بعضوية واحدة يبيع ويشتري بها. والشارة تقولها كما هي بدل أن
 * تترك القارئ يخمّن.
 */
const KIND: Record<UserRow['kind'], { label: string; tone: 'accent' | 'neutral' }> = {
  DEALER: { label: 'معرض', tone: 'accent' },
  INDIVIDUAL: { label: 'فرد', tone: 'neutral' },
};

const STATUS: Record<string, { label: string; tone: 'accent' | 'warn' | 'danger' }> = {
  ACTIVE: { label: 'نشط', tone: 'accent' },
  SUSPENDED: { label: 'موقوف', tone: 'warn' },
  BANNED: { label: 'محظور', tone: 'danger' },
};

const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

/** الحرف الأول — بديل الصورة، فالحساب بلا صورة في المنصة. */
function initial(name: string | null): string {
  const clean = (name ?? '').trim();
  return clean === '' ? '؟' : clean.charAt(0);
}

export function UserCard({ row }: { row: UserRow }) {
  const kind = KIND[row.kind];
  const status = STATUS[row.status];

  return (
    /*
      الكرت حاوية، ورابط الاسم يمتد فوقها بـ`after:inset-0` — فالنقر في
      أي موضع يفتح الملف، ورابط داخل رابط لا يصح.
    */
    <div className="group relative flex items-start gap-4 rounded-xl border border-line bg-surface p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink/8 text-sm font-bold"
      >
        {initial(row.name)}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/users/${encodeURIComponent(row.id)}`}
            className="bidi-isolate truncate text-xs font-bold after:absolute after:inset-0 after:content-['']"
          >
            {row.name ?? 'بلا اسم'}
          </Link>
          <Badge size="sm" tone={kind.tone}>{kind.label}</Badge>
          {row.idVerified ? (
            <Badge size="sm" tone="accent">موثق</Badge>
          ) : (
            <Badge size="sm" tone="warn">غير موثق</Badge>
          )}
          {status === undefined || row.status === 'ACTIVE' ? null : (
            <Badge size="sm" tone={status.tone}>{status.label}</Badge>
          )}
        </div>

        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-3xs opacity-70">
          {/* رقم العميل يُنسخ ويُقارن خانة بخانة — لاتيني معزول */}
          <span dir="ltr" className="font-num text-start">
            {row.ref ?? 'بلا رقم عميل'}
          </span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <span dir="ltr" className="font-num text-start">
            ••{row.phoneTail}
          </span>
          {row.dealerName === null ? null : (
            <>
              <span aria-hidden className="opacity-40">
                ·
              </span>
              <span className="bidi-isolate truncate">{row.dealerName}</span>
            </>
          )}
        </span>
      </div>

      {/*
        ═══ ثلاثة أرقام تقول حال الحساب ═══

        **والإعلان نية والطلب بيعة**: حساب نشر عشرة ولم يبع واحدًا غير
        حساب نشر واحدًا وباعه — والعمود الواحد يخلطهما.
      */}
      <div className="flex shrink-0 items-start gap-5 text-center">
        <Figure label="إعلانات" value={row.listingCount} />
        <Figure label="شراء" value={row.orderCount} />
        <Figure label="بيع" value={row.soldCount} />
        <span className="font-num min-w-16 text-3xs opacity-65">
          {date.format(new Date(row.joinedAt))}
        </span>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex min-w-10 flex-col items-center gap-0.5">
      <ArabicNumber value={value} className="text-sm font-bold" />
      <span className="text-3xs opacity-65">{label}</span>
    </span>
  );
}

import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { MonitorCards, MonitorTabs } from '@/components/admin/MonitorShell';
import { ActivityRow } from '@/components/admin/ActivityRow';
import { AutoRefresh } from '@/components/admin/AutoRefresh';
import { EmptyState } from '@/components/ui/EmptyState';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import {
  ACTIVITY_KINDS,
  activityCounts,
  activityStream,
  isActivityKind,
} from '@/lib/domain/admin-activity';
import { ACTIVITY_KIND_LABEL } from '@/lib/labels/activity';
import { AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مجرى النشاط' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * ═══ مجرى النشاط ═══
 *
 * اللوحة تُجيب «كم» و«ما الذي ينتظرني»، ولا تُجيب **«ماذا يحدث»**. فمن
 * يفتحها صباحًا لا يعرف أن ثلاثة نزاعاتٍ فُتحت ليلًا إلّا بفتح ثلاث
 * شاشات، ولا يرى دفعةً ارتدّت حتى تصير طابورًا.
 *
 * و«سجل العمليات» ليس هذا: **أثرُ الأدمن وحده** — وما يفعله السوق
 * بنفسه ليس فيه.
 *
 * **والتحديث استطلاعٌ ويُقال كما هو.** لا اشتراك في قناةٍ بعد (مُصدِر
 * التذاكر غير مبنيّ)، فالصفحة تُعيد قراءة نفسها كلّ نصف دقيقة ما دامت
 * التبويبة مرئيّة — ولا تُنادى لمن تركها وذهب.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'audit.view')) redirect('/admin');

  const search = await searchParams;
  const raw = typeof search.kind === 'string' ? search.kind : undefined;
  const kind = raw !== undefined && isActivityKind(raw) ? raw : undefined;

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const [events, counts] = await Promise.all([
    activityStream({ kind, limit: 60 }),
    activityCounts(dayAgo),
  ]);

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  /** **حركةُ السوق** = الكلّ ناقص أثر الفريق — ما فعله الناس لا ما فعلناه نحن. */
  const market = total - counts.admin;

  return (
    <AdminShell title="مجرى النشاط" activeHref="/admin/activity" admin={admin}>
      <AutoRefresh seconds={30} />

      <p className="mb-5 max-w-2xl text-2xs leading-loose opacity-70">
        كل ما وقع في السوق مرتبا بالأحدث — الإعلانات والعروض والطلبات والمدفوعات
        والمزايدات والنزاعات والحسابات الجديدة وأثر الفريق، في مجرى واحد.
      </p>

      <MonitorCards
        /*
          **والقيمة تُمرَّر رقمًا لا نصًّا.** `StatCard` تُمرّر الرقم على
          `ArabicNumber` فيُجمَّع بفواصله («1,172» لا «1172»)، والنصّ
          تُجري عليه `font-num` — فمرّرتُ نصًّا فخسرتُ الفاصلة، ومرّرتُ
          اسمًا عربيًّا فرُسم بـArial.
        */
        cards={[
          { title: 'أحداث آخر ٢٤ ساعة', value: total, note: 'من كل المصادر' },
          { title: 'حركة السوق', value: market, note: 'بلا أثر الفريق' },
          { title: 'نزاعات', value: counts.dispute, note: 'فتحت أو حسمت' },
        ]}
      />

      <MonitorTabs
        basePath="/admin/activity"
        param="kind"
        active={kind ?? null}
        tabs={[
          { key: null, label: 'الكل' },
          ...ACTIVITY_KINDS.map((one) => ({
            key: one,
            label: ACTIVITY_KIND_LABEL[one],
            count: counts[one],
            tone: one === 'dispute' && counts[one] > 0 ? ('danger' as const) : ('neutral' as const),
          })),
        ]}
      />

      {events.length === 0 ? (
        <EmptyState
          title="لا نشاط بعد"
          description="ما يقع في السوق — إعلان ينشر، عرض يصل، دفعة تسوى — يظهر هنا لحظة وقوعه."
        />
      ) : (
        <ol className="flex flex-col divide-y divide-line border-y border-line">
          {events.map((event, at) => (
            /*
              **والترتيب جزءٌ من المفتاح.** حسابان أُنشئا في المللي
              نفسها بلا مرجع يُنتجان المفتاح نفسه، فيسقط أحدهما من
              الشجرة — وReact يقولها تحذيرًا في الطرفية لا عطلًا في
              الشاشة، فتُقرأ القائمة ناقصةً صفًّا ولا يُلاحَظ.
            */
            <ActivityRow
              key={`${String(at)}-${event.at}-${event.kind}-${event.key}`}
              event={event}
              at={riyadh.format(new Date(event.at))}
            />
          ))}
        </ol>
      )}
    </AdminShell>
  );
}

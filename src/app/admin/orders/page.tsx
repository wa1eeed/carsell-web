import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { ListSearch } from '@/components/admin/ListSearch';
import { ListFooter } from '@/components/admin/ListFooter';
import { StatCard } from '@/components/ui/StatCard';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { listAdminOrders, orderTabCounts } from '@/lib/domain/admin-orders';
import { STAGE_LABEL } from '@/lib/labels/charts';
import type { OrderStage } from '@/generated/prisma/enums';
import { OrderCard } from '@/components/admin/OrderCard';

export const dynamic = 'force-dynamic';

/**
 * A4 — الطلبات.
 *
 * **مدّة البقاء + تنبيه تجاوز الضعف** (معيار القبول). و«الضعف» ضعف
 * الهدف المعلن لكل مرحلة لا رقم واحد للجميع: رقمٌ موحّد يصرخ على مرحلة
 * بطيئة بطبعها ويصمت عن أخرى تعثّرت.
 *
 * ═══ والتابز — وكانت الترويسة تَعِد بها ولا وجود لها ═══
 *
 * العنوان الفرعيّ يقول «تابز لكل مرحلة» منذ بُنيت الشاشة، والقائمة
 * واحدة تعرض كل شيء — فمن أراد «المتعثّرة» قرأ ثلاث مئة صفٍّ بعينه.
 * والتصميم يضع أحد عشر شريحة، ولكلٍّ عدّادها.
 */
const STAGES: readonly OrderStage[] = [
  'REQUEST', 'APPROVED', 'INSPECTION', 'PAYMENT', 'TRANSFER', 'DONE',
];

/** الشرائح المنتهية — حالةٌ لا مرحلة، فتُقرأ من عمودٍ آخر. */
const CLOSED = ['completed', 'cancelled', 'stalled', 'disputed'] as const;

const CLOSED_LABEL: Record<(typeof CLOSED)[number], string> = {
  completed: 'مكتملة',
  cancelled: 'ملغاة',
  stalled: 'متعثّرة',
  disputed: 'نزاع',
};

/**
 * ═══ بطاقةٌ تُفتح متى كان فيها ما يُفتح ═══
 *
 * **والصفر لا يُربط**: «عليها نزاع ٠» رابطُه يقود إلى قائمةٍ فارغة —
 * ووعدٌ بشيءٍ ثم فراغٌ أسوأ من رقمٍ ساكن.
 */
function StatLink({
  href,
  show,
  children,
}: {
  href: string;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return <>{children}</>;
  return (
    <Link href={href} className="transition-opacity hover:opacity-80">
      {children}
    </Link>
  );
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const search = await searchParams;
  const raw = typeof search.tab === 'string' ? search.tab : 'all';
  const q = typeof search.q === 'string' && search.q.trim() !== '' ? search.q.trim() : null;
  /**
   * ═══ `?late=1` و`?critical=1` ═══
   *
   * `onlyLate` موجودٌ في مرشّحات النطاق منذ بُنيت **ولا يمرّره أحد**.
   * ولوحةُ القيادة تقول «واحد تجاوز ضعف المدّة» ولا تعطي طريقًا إليه —
   * فتُخبر المشغّل بمشكلةٍ ثمّ تتركه يبحث عنها في قائمةٍ من مئتين.
   *
   * **واثنان لأنهما حدّان مختلفان**: `late` تجاوزَ الهدف، و`critical`
   * تجاوزَ ضعفَه. **وشارةٌ تعدّ أحدهما وتربط إلى الآخر تعرض رقمًا غير
   * الذي ضُغط** — وهو الصنف الذي تمنعه البوابة ٤٠.
   */
  const onlyLate = search.late === '1';
  const onlyCritical = search.critical === '1';

  const stage = STAGES.find((key) => key === raw);
  const closed = CLOSED.find((key) => key === raw);
  const active: string | null = stage ?? closed ?? null;
  /** الشريحة المنتهية — مكتملةً أو ملغاة. */
  const closedTab = closed === 'completed' || closed === 'cancelled' ? closed : null;

  const [orders, counts] = await Promise.all([
    /**
     * **والشريحة تُرشَّح في الاستعلام لا في الذاكرة.** الترشيح بعد
     * الجلب يجعل `take: 200` يقصّ قبل أن يُرشَّح، فتُعرض شريحةٌ ناقصة
     * وتبدو أصغر ممّا هي.
     */
    /**
     * **والشريحة المنتهية تُطلب بحالتها.** كانت تُرشَّح من القائمة
     * القائمة — وتلك لا تحمل مكتملًا ولا ملغيًّا أصلًا، فتعرضان
     * فراغًا أبدًا وعدّادُهما يقول رقمًا.
     */
    listAdminOrders({
      ...(stage === undefined ? {} : { stage }),
      ...(closed === 'completed'
        ? { status: 'COMPLETED' as const }
        : closed === 'cancelled'
          ? { status: 'CANCELLED' as const }
          : {}),
      q,
      ...(onlyLate ? { onlyLate: true } : {}),
    }),
    orderTabCounts(),
  ]);

  const filtered = onlyCritical ? orders.filter((order) => order.critical) : orders;
  const rows =
    closed === undefined || closed === 'completed' || closed === 'cancelled'
      ? filtered
      : closed === 'disputed'
        ? filtered.filter((order) => order.hasDispute)
        : filtered.filter((order) => order.critical);

  const late = orders.filter((order) => order.late).length;
  const critical = orders.filter((order) => order.critical).length;
  const disputed = orders.filter((order) => order.hasDispute).length;

  const tabs: MonitorTab[] = [
    { key: null, label: 'الكل', count: counts.all },
    ...STAGES.map((key) => ({
      key,
      label: STAGE_LABEL[key] ?? key,
      count: counts.byStage[key] ?? 0,
    })),
    { key: 'completed', label: CLOSED_LABEL.completed, count: counts.completed },
    { key: 'cancelled', label: CLOSED_LABEL.cancelled, count: counts.cancelled },
    { key: 'stalled', label: CLOSED_LABEL.stalled, count: counts.stalled, tone: 'warn' as const },
    {
      key: 'disputed',
      label: CLOSED_LABEL.disputed,
      count: counts.disputed,
      tone: 'danger' as const,
    },
  ];

  return (
    <AdminShell title="الطلبات"
      subtitle="تابز لكل مرحلة وإجراء مباشر" activeHref="/admin/orders" admin={admin}>
      <ListSearch
        action="/admin/orders"
        value={q}
        placeholder="رقم الطلب · مرجع الإعلان · اسم المشتري أو البائع"
        keep={{ tab: active }}
      />

      <MonitorTabs tabs={tabs} active={active} basePath="/admin/orders" param="tab" />

      {/*
        ═══ وبطاقةٌ تعدّ مشكلةً تفتح قائمتها ═══

        «تجاوزت الهدف ٧» و«متأخّرة جدًّا» و«عليها نزاع» أرقامٌ **يُقرَّر
        عليها** — وكانت نصًّا جامدًا: يقرأ المشغّل أن سبعةً تأخّرت ثم
        يبحث عنها بين المئتين بعينه.

        والرابط يحمل ما تعدّه البطاقة بعينه: `late` لتجاوز الهدف،
        و`critical` لضعفه، وتبويب النزاع للنزاع — فلا يُضغط رقمٌ
        ويُعرض غيرُه.

        **وعمودان من أصغر مقاس**: `md:grid-cols-4` تتكدّس أربعًا دون
        ٧٦٨px فتملأ الشاشة قبل أوّل طلب.
      */}
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="طلبات جارية" value={orders.length} />
        <StatLink
          href={`/admin/orders?late=1${active === null ? '' : `&tab=${active}`}`}
          show={late > 0}
        >
          <StatCard label="تجاوزت الهدف" value={late} tone={late > 0 ? 'warn' : 'plain'} />
        </StatLink>
        <StatLink
          href={`/admin/orders?critical=1${active === null ? '' : `&tab=${active}`}`}
          show={critical > 0}
        >
          <StatCard label="متأخّرة جدًّا" value={critical} tone={critical > 0 ? 'warn' : 'plain'} />
        </StatLink>
        <StatLink href="/admin/orders?tab=disputed" show={disputed > 0}>
          <StatCard label="عليها نزاع" value={disputed} tone={disputed > 0 ? 'warn' : 'plain'} />
        </StatLink>
      </div>

      {/*
        ═══ والشريحة تَفي بما وعدت ═══

        كانت «مكتملة ٢» تُفتح على **فقرةٍ** تقول إن القائمة للجاري
        وحده — وشريحةٌ تحمل عددًا ولا تعرض صفًّا وعدٌ مُخلَف، مهما كان
        سببُه مكتوبًا تحتها.

        والسبب نفسُه ما زال صحيحًا: الطابور عملٌ لا أرشيف. فالصفوف
        تُعرض، **ويُقال فوقها إنها منتهية** — فلا يُخلط ما يُتابَع بما
        انتهى، ولا تُفتح شريحةٌ على فراغ.
      */}
      {closedTab === null ? null : (
        <p className="mb-3 rounded-lg border border-line bg-surface px-4 py-3 text-3xs leading-relaxed opacity-75">
          هذه طلبات منتهية — معروضة للمراجعة لا للمتابعة. وللأرشيف الكامل
          والتصدير:{' '}
          <Link href="/admin/exports" className="font-bold underline underline-offset-2">
            التقارير والتصدير
          </Link>
          .
        </p>
      )}

      {/*
        **والكروت لا الجدول.** الصفّ كان مرجعًا ومرحلةً ومبلغًا،
        فمراجعةُ عشرين طلبًا عشرون فتحًا ورجوعًا. والكرت يحمل
        المركبة والطرفين وتوثيقَهما وحالَ الضمان — وهي ما يُقرَّر به.
      */}
      {rows.length === 0 ? (
        <EmptyState
          title="لا طلبات في هذه الشريحة"
          description="اختر شريحةً أخرى، أو ابحث بمرجع الطلب أو اسم أحد الطرفين."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((order) => (
            <OrderCard key={order.ref} row={order} />
          ))}
        </div>
      )}

      <ListFooter
        shown={rows.length}
        /**
         * **والمقام هو القائم لا الكلّ.** `counts.all` يضمّ المكتمل
         * والملغى، والطابور لا يعرضهما — فـ«٨ من ١٤» تقرأ على أن ستّة
         * أُخفيت، وهي منتهيةٌ أصلًا. فالمقام مجموع المراحل.
         */
        total={
          stage === undefined && closedTab === null
            ? Object.values(counts.byStage).reduce((sum, n) => sum + n, 0)
            : null
        }
        note={
          closedTab === null
            ? 'القائمة تعرض الطلبات الجارية · والمنتهية في شريحتيها'
            : 'طلبات منتهية — للمراجعة لا للمتابعة'
        }
        can="نقل الطلب للمرحلة التالية إذا توقف التحديث التلقائي، وتمديد مهلة نقل الملكية مرة واحدة مع ذكر السبب، وإلغاء الطلب بدلًا عن الطرفين."
        cannot="الإفراج عن مبلغ الضمان بضغطة — يحتاج موافقة شخصين وسببًا مكتوبًا، ويُقيَّد في سجلّ التدقيق."
        automatic="طلبٌ تجاوز ضعف هدف مرحلته يظهر أوكر، وثلاثة أضعافه أحمر."
      />
    </AdminShell>
  );
}

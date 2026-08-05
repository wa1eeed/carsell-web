import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { StatCard } from '@/components/ui/StatCard';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { listAdminOrders, orderTabCounts } from '@/lib/domain/admin-orders';
import { STAGE_LABEL } from '@/lib/labels/charts';
import type { OrderStage } from '@/generated/prisma/enums';
import { OrdersTable } from './OrdersTable';

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

  const stage = STAGES.find((key) => key === raw);
  const closed = CLOSED.find((key) => key === raw);
  const active: string | null = stage ?? closed ?? null;

  const [orders, counts] = await Promise.all([
    /**
     * **والشريحة تُرشَّح في الاستعلام لا في الذاكرة.** الترشيح بعد
     * الجلب يجعل `take: 200` يقصّ قبل أن يُرشَّح، فتُعرض شريحةٌ ناقصة
     * وتبدو أصغر ممّا هي.
     */
    listAdminOrders(stage === undefined ? {} : { stage }),
    orderTabCounts(),
  ]);

  const rows =
    closed === undefined
      ? orders
      : closed === 'disputed'
        ? orders.filter((order) => order.hasDispute)
        : closed === 'stalled'
          ? orders.filter((order) => order.critical)
          : [];

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
      <MonitorTabs tabs={tabs} active={active} basePath="/admin/orders" param="tab" />

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <StatCard label="طلبات جارية" value={orders.length} />
        <StatCard label="تجاوزت الهدف" value={late} tone={late > 0 ? 'warn' : 'plain'} />
        <StatCard label="متأخّرة جدًّا" value={critical} tone={critical > 0 ? 'warn' : 'plain'} />
        <StatCard label="عليها نزاع" value={disputed} tone={disputed > 0 ? 'warn' : 'plain'} />
      </div>

      {/*
        **والشريحة المنتهية تقول أين تُقرأ.** `listAdminOrders` تجلب
        النشط وحده عمدًا (الطابور عملٌ لا أرشيف)، فجدولٌ فارغ تحت
        «مكتملة ٩٦» يُقرأ على أنه عطل لا على أنه حدّ.
      */}
      {closed === 'completed' || closed === 'cancelled' ? (
        <p className="rounded-lg border border-line bg-surface p-5 text-2xs leading-loose opacity-70">
          هذا الطابور للطلبات القائمة. والمنتهية تُقرأ من <b>التقارير والتصدير</b> —
          فإبقاؤها هنا يُغرق ما يحتاج عملًا بما لا يحتاجه.
        </p>
      ) : (
        <OrdersTable orders={rows} />
      )}
    </AdminShell>
  );
}

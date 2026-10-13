import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { identityQueue, identityStats } from '@/lib/domain/admin-identity';
import { db } from '@/lib/db';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import type { IdentityStatus } from '@/generated/prisma/enums';
import { IdentityQueue } from './IdentityQueue';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'توثيق الهوية' };

/**
 * A18 — توثيق الهوية.
 *
 * **لم يكن أحدٌ يوثَّق إطلاقًا**: `idVerified` منطقيّ بلا كاتب، ولا
 * شاشة تعرض من قدّم هويته — وحارس الشراء يقرؤه. فكل حساب ممنوع من كل
 * معاملة، والباب الذي يُستوفى منه غير موجود.
 */
/**
 * شرائح A18 — **و`identityQueue` كانت تقبل الترشيح ولا يمرّره أحد.**
 * القدرة مبنيّة من يومها، والطابور يُعرض كاملًا فيقرأ المراجع
 * «موثَّق ١٬٤٢٨» صفًّا صفًّا ليجد السبعة التي تنتظره.
 */
const SEGMENTS: readonly { key: IdentityStatus | null; label: string }[] = [
  { key: 'PENDING', label: 'ينتظر' },
  { key: 'CLARIFICATION', label: 'مُعلَّق للتوضيح' },
  { key: 'VERIFIED', label: 'موثّق' },
  { key: 'REJECTED', label: 'مرفوض' },
];

export default async function AdminIdentityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'identity.review')) redirect('/admin');

  const search = await searchParams;
  const raw = typeof search.status === 'string' ? search.status : null;
  const status = SEGMENTS.find((row) => row.key === raw)?.key ?? null;

  const [rows, stats] = await Promise.all([identityQueue(status), identityStats()]);

  /**
   * **والعدّاد من `identityStats` لا من طول الصفوف.** الطابور محدودٌ
   * بمئتين، فعدُّ ما يُعرض يقول «موثّق ٢٠٠» على ألفٍ وأربعمئة.
   */
  const counts: Record<string, number> = {
    PENDING: stats.waiting,
    CLARIFICATION: stats.clarification,
    VERIFIED: stats.verifiedTotal,
    REJECTED: stats.rejectedTotal,
  };

  /**
   * **ومربوطٌ يعني يعمل.** `status: ACTIVE` وحدها صفٌّ، والمفاتيح شرط —
   * فتكاملٌ مفعَّل بلا مفاتيح لا يوثّق أحدًا.
   */
  const nafath = await db.integration.findUnique({
    where: { key: 'nafath' },
    select: { status: true },
  });
  const nafathLive = nafath?.status === 'ACTIVE';

  const tabs: MonitorTab[] = [
    {
      key: null,
      label: 'قائمة التوثيق',
      count: stats.waiting + stats.clarification,
      tone: stats.waiting > 0 ? ('warn' as const) : undefined,
    },
    ...SEGMENTS.map((row) => ({
      key: row.key,
      label: row.label,
      count: counts[row.key ?? ''] ?? 0,
    })),
  ];

  return (
    <AdminShell title="توثيق الهوية"
      subtitle="طلبات توثيق الهوية" activeHref="/admin/identity" admin={admin}>
      {/*
        ═══ والسطر يقرأ حالَ التكامل لا يفترضه ═══

        كان يقول «الطلبات اليدوية فقط · التوثيق عبر النفاذ الوطني يتم
        تلقائيًا» — **و`submitIdentity('nafath')` لا يناديها أحد**، والنفاذ
        في `/admin/integrations` «بلا مفاتيح». فكلُّ توثيقٍ يمرّ بإنسان،
        ويقرأ المشغّل أن الطابور بقيّةٌ صغيرة فلا يرصد له أحدًا.

        ويوم تصل المفاتيح يتغيّر السطر وحده — فلا جملةٌ تُنسى في ملفّ.
      */}
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        {nafathLive
          ? 'الطلبات اليدوية فقط. التوثيق عبر النفاذ الوطني يتم تلقائيًا، والهدف أقل من ساعة.'
          : 'كل طلب هنا يمرّ بمراجعة إنسان — النفاذ الوطني لم يُربط بعد، فلا توثيق تلقائيّ. والهدف أقل من ساعة.'}
      </p>

      <MonitorTabs tabs={tabs} active={status} basePath="/admin/identity" param="status" />

      <IdentityQueue rows={rows} stats={stats} />
    
      <ListFooter
        shown={rows.length}
        total={null}
        note={
          nafathLive
            ? 'الطلبات اليدوية فقط · النفاذ الوطني تلقائي'
            : 'كل الطلبات يدوية · النفاذ الوطني غير مربوط'
        }
        can="التوثيق أو طلب توضيح أو الرفض بسببٍ مكتوب."
        cannot="عرض صورة الهوية أو رقمها كاملًا من الجدول — الاطلاع فعلٌ مقصود يُقيَّد قبل أن يُعرض شيء."
      />
    </AdminShell>
  );
}

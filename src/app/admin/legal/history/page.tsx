import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { Quantity } from '@/components/ui/Quantity';
import { MonitorList, MonitorRow } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { legalVersions } from '@/lib/domain/admin-legal';
import { LEGAL_VERSION_STATUS } from '@/lib/labels/legal';
import { AR_DATE_LOCALE, displayDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'سجل النسخ' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

const TONE = {
  PUBLISHED: 'accent',
  DRAFT: 'warn',
  SUPERSEDED: 'neutral',
} as const;

/**
 * A34 — «سجل النسخ»، وزرُّه في رأس الصفحات القانونية.
 *
 * **ولم يكن له ما يُعرض.** المستندات ثمانية بنسخها، ولا صفَّ تاريخٍ
 * لواحدٍ منها — فكلُّ ما يعرفه النظام عن مستندٍ هو حالُه الآن. وترحيلُ
 * `LegalVersion` كتب لكلٍّ صفَّ نسخته السارية، فبدأ الأرشيف من
 * القائم لا من الفراغ.
 *
 * ═══ وعددُ القبول هو ما يجعله سجلًّا ═══
 *
 * نسخةٌ قبِلها ألفٌ لا تُحذف ولا تُمَسّ — وسجلُّ قبولهم يشير إليها
 * باسمها. وهذا العمود هو الذي يقول لماذا تبقى.
 */
export default async function AdminLegalHistoryPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const rows = await legalVersions();

  return (
    <AdminShell
      title="سجل النسخ"
      subtitle={<Quantity unit="legalVersions" count={rows.length} />}
      activeHref="/admin/legal"
      admin={admin}
      actions={
        <LinkButton href="/admin/legal" variant="ghost" size="sm">
          رجوع
        </LinkButton>
      }
    >
      <p className="mb-6 max-w-xl text-sm leading-loose opacity-70">
        كل نسخة نشرت أو تنتظر النشر. <b>والمنشورة لا تحذف</b>: سجل قبول من قبلها
        يشير إليها باسمها، فتبقى بنصها وتاريخها.
      </p>

      <MonitorList
        empty={{ title: 'لا نسخ', description: 'النسخ تكتب عند النشر.' }}
        note="النسخة التي حلت محلها أخرى تبقى «نسخة سابقة» ولا تمس. والمسودة وحدها تسقط، لأن أحدا لم يقبلها."
      >
        {rows.map((row) => (
          <MonitorRow
            key={row.id}
            title={row.documentTitleAr}
            subtitle={
              <span className="font-num">
                {displayDigits(row.documentKey)} · {displayDigits(row.version)}
              </span>
            }
            meta={row.documentKey}
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-3xs opacity-70">
                {row.status === 'DRAFT' ? 'أنشئت' : 'نشرت'}
              </span>
              <span className="text-3xs font-bold">
                {riyadh.format(new Date(row.publishedAt ?? row.createdAt))}
              </span>
            </div>

            <div className="flex flex-col items-start gap-0.5">
              <span className="text-3xs opacity-70">يسري من</span>
              <span className="text-3xs font-bold">
                {row.effectiveAt === null ? '—' : riyadh.format(new Date(row.effectiveAt))}
              </span>
            </div>

            {/*
              **والفارغُ «مع المنصّة» لا اسمٌ مُختلَق.** النسخُ المزروعة
              لا نعرف ناشرَها، وكتابةُ اسمٍ فيها اختلاقُ سجلّ.
            */}
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-3xs opacity-70">نشرها</span>
              <span className="bidi-isolate text-3xs font-bold">
                {row.publishedByName ?? 'مع المنصة'}
              </span>
            </div>

            <div className="flex flex-col items-start gap-0.5">
              <span className="text-3xs opacity-70">قبلوها</span>
              <span className="font-num text-3xs font-bold">
                {displayDigits(String(row.acceptances))}
              </span>
            </div>

            {row.material ? <Badge tone="warn">جوهري</Badge> : null}

            <Badge tone={TONE[row.status]}>{LEGAL_VERSION_STATUS[row.status]}</Badge>
          </MonitorRow>
        ))}
      </MonitorList>
    </AdminShell>
  );
}

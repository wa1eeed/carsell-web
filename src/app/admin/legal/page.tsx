import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { MonitorList, MonitorRow } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { legalDocuments } from '@/lib/domain/admin-content';
import { toArabicDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الصفحات القانونية' };

const TITLE: Record<string, string> = {
  terms: 'الشروط والأحكام',
  privacy: 'سياسة الخصوصية',
  refund: 'سياسة الاسترجاع',
  cookies: 'ملفات الارتباط',
};

const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

/**
 * A34 — الصفحات القانونية.
 *
 * **نسخٌ موقّتة لا تحريرٌ حيّ** — عنوان التصميم حرفيًّا. ومن قبِل
 * الشروط قبِل **نسخةً بعينها**، فتحريرُها في مكانها يجعل موافقته على
 * نصٍّ لم يقرأه. فكل تغييرٍ نسخةٌ جديدة بتاريخ سريان، والقديمة تبقى.
 *
 * ولهذا لا زرّ تحريرٍ هنا: الشاشة تعرض النسخ السارية وتاريخها، والنسخة
 * الجديدة تمرّ بمراجعةٍ قانونية خارج اللوحة ثم تُنشر.
 */
export default async function AdminLegalPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const docs = await legalDocuments();

  return (
    <AdminShell title="الصفحات القانونية" activeHref="/admin/legal" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        النسخ السارية وتواريخ سريانها. <b>نسخٌ موقّتة لا تحريرٌ حيّ</b> — ومن قبِل
        الشروط قبِل نسخةً بعينها.
      </p>

      <MonitorList
        empty={{ title: 'لا مستندات', description: 'المستندات القانونية تُزرع مع المنصّة.' }}
        note="النسخة الجديدة لا تُحرَّر فوق القديمة: تُنشر برقمٍ وتاريخ سريان، والقديمة تبقى لمن قبِلها. ولهذا لا زرّ تحرير في هذه الشاشة."
      >
        {docs.map((doc) => (
          <MonitorRow
            key={doc.key}
            title={TITLE[doc.key] ?? doc.titleAr}
            subtitle={`أقسام (${toArabicDigits(String(doc.sectionCount))})`}
            meta={doc.key}
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="font-num text-2xs font-bold">{toArabicDigits(doc.version)}</span>
              <span className="text-3xs opacity-45">
                يسري من {riyadh.format(new Date(doc.effectiveAt))}
              </span>
            </div>

            {doc.hasSummary ? null : <Badge tone="warn">بلا ملخّص</Badge>}

            <Badge tone={doc.active ? 'accent' : 'neutral'}>
              {doc.active ? 'سارية' : 'غير سارية'}
            </Badge>
          </MonitorRow>
        ))}
      </MonitorList>
    </AdminShell>
  );
}

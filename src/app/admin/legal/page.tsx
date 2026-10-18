import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { MonitorList, MonitorRow } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { legalDocuments, legalSummary } from '@/lib/domain/admin-content';
import { displayDigits, AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الصفحات القانونية' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
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

  const [docs, summary] = await Promise.all([legalDocuments(), legalSummary()]);

  return (
    <AdminShell
      title="الصفحات القانونية"
      /*
        **والجمع لا يُكتب بيد.** «٨ مستندات» تُصيب، و«٢ مستندات» تُخطئ
        («مستندان») — والعربية ستُّ حالات. و`subtitle` نصٌّ لا عنصر فلا
        يبلغها `<Quantity>`، فتُصاغ صيغةً لا يحكمها المعدود.
      */
      subtitle={`المستندات (${displayDigits(String(summary.total))}) · تعديل جوهري يخطر قبل أسبوعين`}
      activeHref="/admin/legal"
      admin={admin}
    >
      <p className="mb-5 max-w-xl text-sm leading-loose opacity-70">
        النسخ السارية وتواريخ سريانها. <b>نسخ موقتة لا تحرير حي</b> — ومن قبل
        الشروط قبل نسخة بعينها.
      </p>

      {/*
        **والعدّاد يقول حال المستندات لا طول القائمة.** الشاشة تعرضها
        كلَّها اليوم، فالعدّان يتفقان صدفةً — وأوّلُ ترشيحٍ يُضاف يجعل
        «٨ مستندات» تعني «٨ معروضة».
      */}
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="مستندات"
          value={summary.total}
          /* «كلها منشورة» حالةٌ تُقال، وغيابُها أهمّ: مستندٌ غير منشور لا يراه زائر */
          breakdown={
            summary.unpublished === 0
              ? [{ label: 'كلها منشورة', value: summary.total }]
              : [
                  { label: 'منشورة', value: summary.total - summary.unpublished },
                  { label: 'غير منشورة', value: summary.unpublished },
                ]
          }
        />
        <StatCard
          label="غير منشورة"
          value={summary.unpublished}
          tone={summary.unpublished > 0 ? 'warn' : 'plain'}
        />
        <StatCard label="بنود" value={summary.sections} />
        {/*
          ═══ وآخر تحديثٍ قيمتُه تاريخ لا عدد ═══

          `StatCard` تعرض رقمًا، وهذه تعرض يومًا واسمَ مستند — فبطاقةٌ
          بجوارها لا بطاقةٌ تُحشر فيها. والتاريخ وحده لا يكفي: «١
          أغسطس» بلا اسمٍ تحتها تجعل الأدمن يفتح الثمانية ليعرف أيّها
          مُسّ.
        */}
        <div className="flex flex-col justify-center gap-1 rounded-lg border border-line bg-surface p-5">
          <span className="text-3xs opacity-70">آخر تحديث</span>
          {summary.latest === null ? (
            <span className="text-2xs opacity-70">لا مستندات</span>
          ) : (
            <>
              <span className="text-md font-bold">
                {riyadh.format(new Date(summary.latest.updatedAt))}
              </span>
              <span className="bidi-isolate text-3xs opacity-70">{summary.latest.titleAr}</span>
            </>
          )}
        </div>
      </div>

      <MonitorList
        empty={{ title: 'لا مستندات', description: 'المستندات القانونية تزرع مع المنصة.' }}
        note="النسخة الجديدة لا تحرر فوق القديمة: تنشر برقم وتاريخ سريان، والقديمة تبقى لمن قبلها. ولهذا لا زر تحرير في هذه الشاشة."
      >
        {docs.map((doc) => (
          <MonitorRow
            key={doc.key}
            title={doc.titleAr}
            subtitle={`أقسام (${displayDigits(String(doc.sectionCount))})`}
            meta={doc.key}
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="font-num text-2xs font-bold">{displayDigits(doc.version)}</span>
              <span className="text-3xs opacity-65">
                يسري من {riyadh.format(new Date(doc.effectiveAt))}
              </span>
            </div>

            {/*
              **والسريان غير التحديث.** الأوّل «منذ متى أنت محكوم
              بهذا»، والثاني «هل مُسّ بعدها» — وتصحيحٌ مطبعيّ يحرّك
              الثاني وحده. والتصميم يضعهما عمودين.
            */}
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-3xs opacity-70">آخر تحديث</span>
              <span className="text-3xs font-bold">
                {riyadh.format(new Date(doc.updatedAt))}
              </span>
            </div>

            {doc.hasSummary ? null : <Badge tone="warn">بلا ملخص</Badge>}

            <Badge tone={doc.active ? 'accent' : 'neutral'}>
              {doc.active ? 'سارية' : 'غير سارية'}
            </Badge>
          </MonitorRow>
        ))}
      </MonitorList>
    </AdminShell>
  );
}

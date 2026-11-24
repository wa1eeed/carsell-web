import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { Quantity } from '@/components/ui/Quantity';
import { StatCard } from '@/components/ui/StatCard';
import { MonitorList, MonitorRow } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { legalDocuments, legalSummary } from '@/lib/domain/admin-legal';
import { acceptanceStats, REACCEPT_NOTICE_DAYS } from '@/lib/domain/legal';
import { LEGAL_SURFACE } from '@/lib/labels/legal';
import { displayDigits, AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الصفحات القانونية' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

const dayMonth = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Riyadh',
});

/**
 * A34 — الصفحات القانونية.
 *
 * **نسخٌ موقّتة لا تحريرٌ حيّ** — عنوان التصميم حرفيًّا. ومن قبِل
 * الشروط قبِل **نسخةً بعينها**، فتحريرُها في مكانها يجعل موافقته على
 * نصٍّ لم يقرأه. فكل تعديلٍ مسوّدةٌ جديدة بتاريخ سريان، والمنشورةُ
 * تبقى بتاريخها لمن قبِلها.
 *
 * ═══ وكان القبولُ وعدًا بلا سجلّ ═══
 *
 * شاشةُ الدخول تشترط تأشير «أوافق على الشروط والأحكام وسياسة
 * الخصوصية» ولا تمضي بدونه — **ولا صفَّ في القاعدة كلِّها يقول إنّ
 * أحدًا قبِل شيئًا**. فبطاقةُ «نسبة القبول» في الترميز لم يكن لها ما
 * تُحسب منه، وهي الآن تُحسب من `LegalAcceptance`.
 */
export default async function AdminLegalPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const [docs, summary, acceptance] = await Promise.all([
    legalDocuments(),
    legalSummary(),
    acceptanceStats(),
  ]);

  return (
    <AdminShell
      title="الصفحات القانونية"
      /* **والجمع من `<Quantity>` لا من يد** — و`subtitle` تقبل عنصرًا. */
      subtitle={
        <>
          <Quantity unit="legalDocs" count={summary.total} /> · تعديل جوهري يخطر قبل{' '}
          <Quantity unit="daysGenitive" count={REACCEPT_NOTICE_DAYS} />
        </>
      }
      activeHref="/admin/legal"
      admin={admin}
      actions={
        <div className="flex shrink-0 items-center gap-2">
          <LinkButton href="/admin/legal/history" variant="ghost" size="sm">
            سجل النسخ
          </LinkButton>
          <LinkButton href="/admin/legal/new" size="sm">
            مستند جديد
          </LinkButton>
        </div>
      }
    >
      <p className="mb-5 max-w-xl text-sm leading-loose opacity-70">
        النسخ السارية وتواريخ سريانها. <b>نسخ موقتة لا تحرير حي</b>: التعديل ينشئ
        مسودة، ونشرها يحفظ السابقة بتاريخها — لأن مستخدما قبلها بذلك النص.
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
          label="نسخ مسودة"
          value={summary.drafts}
          tone={summary.drafts > 0 ? 'warn' : 'plain'}
          breakdown={
            summary.drafts === 0
              ? [{ label: 'لا شيء ينتظر النشر', value: 0 }]
              : [{ label: 'بانتظار المراجعة', value: summary.drafts }]
          }
        />
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
                {dayMonth.format(new Date(summary.latest.updatedAt))}
              </span>
              <span className="bidi-isolate text-3xs opacity-70">{summary.latest.titleAr}</span>
            </>
          )}
        </div>

        {/*
          ═══ ونسبةُ القبول قيمتُها في نقصانها ═══

          مئةٌ لا تقول شيئًا، ونقصُها يقول أحد أمرين: نسخةٌ جوهريّةٌ
          نفذت ولم يقبلها الجميع، أو حساباتٌ لا سجلَّ قبولٍ لها أصلًا —
          وهو حالُنا، إذ سبق المنتجُ سجلَّه. **ولا يُختلَق لها صفّ**:
          تُسأل موافقتُها فيرتفع الرقم بما يقع.
        */}
        <StatCard
          label="نسبة القبول"
          value={acceptance.pct}
          suffix="٪"
          tone={acceptance.pct >= 100 ? 'plain' : 'warn'}
          /*
            **و«إلزاميّ للتسجيل» معنى البطاقة لا حالةٌ منها.** كانت
            تُعرض حين تبلغ النسبةُ مئةً وحدها، فيختفي **ما تقيسه
            البطاقة** في الحال التي تُفتح لأجلها. فهو سطرُها الأوّل
            دائمًا، والنقصُ يُضاف تحته.
          */
          breakdown={
            acceptance.pct >= 100
              ? [{ label: 'إلزامي للتسجيل', value: acceptance.required }]
              : [
                  { label: 'إلزامي للتسجيل', value: acceptance.required },
                  { label: 'بلا سجل قبول', value: acceptance.users - acceptance.accepted },
                ]
          }
        />
      </div>

      <MonitorList
        empty={{
          title: 'لا مستندات',
          description: 'المستندات القانونية تزرع مع المنصة، والجديد من «مستند جديد».',
        }}
        note="المنشور لا يحرر فوق نفسه: التعديل ينشئ مسودة برقم جديد، ونشرها يسلم السابقة إلى الأرشيف وتبقى لمن قبلها. والقبول يثبت بالنسخة لا بالمستند."
      >
        {docs.map((doc) => (
          <MonitorRow
            key={doc.key}
            title={doc.titleAr}
            subtitle={<Quantity unit="docSections" count={doc.sectionCount} />}
            meta={doc.key}
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="font-num text-2xs font-bold">
                {displayDigits(doc.version)}
                {doc.draftVersion === null ? null : (
                  <span className="font-body opacity-70">
                    {' '}
                    · مسودة {displayDigits(doc.draftVersion)}
                  </span>
                )}
              </span>
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

            {/*
              ═══ «يظهر في» — عمودٌ في الترميز، ومشتقٌّ هنا ═══

              وفارغُه ليس فراغًا بل حالة: مستندٌ لا يظهر في أيّ سطح
              مكتوبٌ ولا يقرؤه أحد — وهو ما يكشفه العمود.
            */}
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-3xs opacity-70">يظهر في</span>
              <span className="text-3xs font-bold">
                {doc.surfaces.length === 0
                  ? 'لم تنشر'
                  : doc.surfaces.map((surface) => LEGAL_SURFACE[surface]).join(' · ')}
              </span>
            </div>

            {doc.hasSummary ? null : <Badge tone="warn">بلا ملخص</Badge>}

            {doc.draftVersion === null ? null : <Badge tone="warn">مسودة</Badge>}

            <Badge tone={doc.active ? 'accent' : 'neutral'}>
              {doc.active ? 'منشور' : 'غير منشور'}
            </Badge>

            <Link
              href={`/admin/legal/${doc.key}`}
              className="shrink-0 rounded-md border border-line px-3 py-1.5 text-3xs font-bold hover:bg-bg"
            >
              {doc.draftVersion === null ? 'تعديل' : 'راجع'}
            </Link>
          </MonitorRow>
        ))}
      </MonitorList>

      {/*
        ═══ القاعدتان المكتوبتان في الترميز ═══

        وهما قاعدتا عملٍ لا شرحٌ للشاشة: الأولى سببُ وجود `LegalVersion`،
        والثانية سببُ وجود `material` و`LegalAcceptance`.
      */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-5">
          <p className="mb-2 text-2xs font-bold">لا تحرير على المنشور</p>
          <p className="text-3xs leading-loose opacity-72">
            التعديل ينشئ <b>نسخة جديدة</b> بمسودة، والنشر يسري بضغطة من يملك
            الصلاحية ويسجل فاعله في سجل التدقيق. والنسخة المنشورة تبقى محفوظة
            بتاريخها — لأن مستخدما قبلها بذلك النص، والقبول يثبت بالنسخة لا
            بالمستند.
          </p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-5">
          <p className="mb-2 text-2xs font-bold">عند تعديل جوهري</p>
          <p className="text-3xs leading-loose opacity-72">
            المسودة الموسومة <b>جوهرية</b> لا تنشر بتاريخ سريان أقرب من{' '}
            <Quantity unit="daysGenitive" count={REACCEPT_NOTICE_DAYS} />، ويطلب
            قبول جديد عند أول فتح بعد نفاذها. ويسجل تاريخ قبول كل مستخدم لكل
            نسخة.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}

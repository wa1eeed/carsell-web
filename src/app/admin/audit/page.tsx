import { redirect } from 'next/navigation';
import { AdminLink } from '@/components/admin/AdminLink';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { Badge } from '@/components/ui/Badge';
import { MonitorCards, MonitorList, MonitorRow, MonitorTabs } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import {
  AUDIT_LENS_KEYS,
  auditCounts,
  auditTrail,
  type AuditLens,
} from '@/lib/domain/admin-monitors';
import { AUDIT_ACTION_LABEL } from '@/lib/labels/audit';
import { AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'سجل التدقيق' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * A16 — سجل التدقيق.
 *
 * **لا يُعدَّل ولا يُحذف** — وهو تعريفه لا خاصّيةٌ فيه. فلا زرّ هنا
 * إطلاقًا: سجلٌّ فيه زرّ تعديل ليس سجلًّا.
 *
 * والتصفية **بصنف الإجراء لا ببحثٍ نصّيّ**: من يبحث عن «إفراج» يفوته
 * `escrow.settled`، ومن يصفّي بالصنف يجد كل ما يمسّ المال.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ lens?: string; from?: string; to?: string; action?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'audit.view')) redirect('/admin');

  const { lens, from, to, action } = await searchParams;

  /**
   * **والتاريخ يُفحص قبل أن يُبنى منه `Date`** — «abc» تُنتج `Invalid
   * Date` فيردّ Prisma خطأً يتّهم الاستعلام لا المُدخَل.
   * و«إلى» تُدفَع إلى آخر اليوم: من كتب الخميس يقصد بنهايته.
   */
  const parse = (value: string | undefined, endOfDay = false): Date | undefined => {
    if (value === undefined || value === '') return undefined;
    const date = new Date(endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };
  const filter = {
    from: parse(from),
    to: parse(to, true),
    action: action ?? '',
  };
  const filtered =
    filter.from !== undefined || filter.to !== undefined || filter.action !== '';
  const active = lens !== undefined && (AUDIT_LENS_KEYS as readonly string[]).includes(lens) ? (lens as AuditLens) : null;

  const [rows, counts] = await Promise.all([auditTrail(active, 120, filter), auditCounts()]);

  return (
    <AdminShell title="سجل التدقيق" activeHref="/admin/audit" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-70">
        كل إجراء بمن فعله ومتى وماذا تغير. <b>لا يعدل ولا يحذف</b> — ولا زر في هذه
        الشاشة.
      </p>

      {/*
        **والتصدير بابُه الكتالوج** — لا مُصدِّرٌ ثانٍ: التقرير في
        `report-catalog` بصلاحيته، فيُقيَّد إخراجُه بعدد صفوفه كما يُقيَّد
        تقرير العملاء. والصفوف تحمل أسماءً وعناوين آيبي.
      */}
      <div className="mb-4 flex justify-end">
        {/*
          رابطٌ لا زرّ: التنزيل تصفّحٌ إلى ملف، و`<Link>` تتنقّل في العميل
          فلا يُنزَّل شيء. و`download` هي ما يُسكت قاعدةَ Next أيضًا — فهي
          تحسب `/api/` صفحةً ما لم يُعلَن أنّ الرابط تنزيل.
        */}
        <a
          href="/api/v1/admin/exports/audit_log"
          download
          className="rounded-md border border-ink px-3.5 py-2 text-2xs font-bold text-ink hover:bg-ink/5"
        >
          تصدير CSV
        </a>
      </div>

      <MonitorCards
        cards={[
          { title: 'إجمالي المدخلات', value: counts.total ?? 0, note: 'منذ البداية' },
          { title: 'تمس المال', value: counts.money ?? 0, note: 'إفراج · عمولة · مهل' },
          { title: 'تمس بيانات شخصية', value: counts.identity ?? 0, note: 'اطلاع وتوثيق' },
          { title: 'تمس الصلاحيات', value: counts.permissions ?? 0, note: 'حسابات وأدوار' },
        ]}
      />

      <MonitorTabs
        basePath="/admin/audit"
        param="lens"
        active={active}
        tabs={[
          { key: null, label: 'الكل', count: counts.total ?? 0 },
          /*
            **والحسّاسة أوّلًا** — وهي أضيقُ العدسات لا أوسعُها: ما لا
            رجعةَ فيه على إنسان، أو مالٌ يخرج، أو تبديلُ من يملك ماذا.
            ومدقّقٌ يفتح الشاشة يبدأ منها لا من أربعة آلاف سطر.
          */
          { key: 'sensitive', label: 'حساسة', count: counts.sensitive ?? 0 },
          { key: 'money', label: 'مالية', count: counts.money ?? 0 },
          { key: 'identity', label: 'بيانات شخصية', count: counts.identity ?? 0 },
          { key: 'permissions', label: 'صلاحيات', count: counts.permissions ?? 0 },
        ]}
      />

      {/*
        ═══ التصفية المتقدّمة — استمارةٌ بـGET ═══

        العدسةُ تسأل «أيّ صنف»، والمدقّق يسأل «ماذا وقع بين الاثنين
        والخميس» و«من فعل كذا». واستمارةُ GET تُبقي الشاشة خادمًا خالصًا،
        ورابطُها يُنسخ ويُرسَل كما هو — وهو ما يحتاجه من يُحيل مراجعًا
        إلى نافذةٍ بعينها.
      */}
      <details className="mb-4 rounded-lg border border-line bg-surface" open={filtered}>
        <summary className="cursor-pointer px-4 py-3 text-2xs font-bold">تصفية متقدمة</summary>
        <form method="get" className="flex flex-wrap items-end gap-3 border-t border-line p-4">
          {active === null ? null : <input type="hidden" name="lens" value={active} />}
          <label className="flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-70">من</span>
            <input
              type="date"
              name="from"
              defaultValue={from ?? ''}
              dir="ltr"
              className="rounded-md border border-line bg-bg px-3 py-2 text-start font-num text-2xs"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-70">إلى</span>
            <input
              type="date"
              name="to"
              defaultValue={to ?? ''}
              dir="ltr"
              className="rounded-md border border-line bg-bg px-3 py-2 text-start font-num text-2xs"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-70">الإجراء</span>
            {/* يُطابَق جزءًا: «escrow» تُخرج كل ما بدأ به — واللاتينيّ معزول */}
            <input
              type="text"
              name="action"
              defaultValue={action ?? ''}
              placeholder="escrow"
              dir="ltr"
              className="rounded-md border border-line bg-bg px-3 py-2 text-start font-num text-2xs"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-2xs font-bold text-bg"
          >
            صف
          </button>
          {filtered ? (
            <AdminLink href={active === null ? '/admin/audit' : `/admin/audit?lens=${active}`}>
              امسح التصفية
            </AdminLink>
          ) : null}
        </form>
      </details>

      <MonitorList
        empty={{ title: 'لا مدخلات', description: 'كل إجراء أدمن يكتب هنا فور وقوعه.' }}
        note="السجل يضاف إليه ولا يعدل. والاحتفاظ 24 شهرا، والحذف لا سبيل إليه من اللوحة."
      >
        {rows.map((row) => (
          <MonitorRow
            key={row.id}
            title={AUDIT_ACTION_LABEL[row.action] ?? row.action}
            subtitle={`${row.entity} · ${row.entityId}`}
            meta={riyadh.format(new Date(row.createdAt))}
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="bidi-isolate text-2xs font-semibold">
                {row.actorName ?? 'النظام'}
              </span>
              <span className="font-num text-3xs opacity-65">{row.actorRole}</span>
            </div>

            {/* النظام فاعلٌ أيضًا — ووسمُه يميّز ما وقع بلا إنسان */}
            <Badge tone={row.actorType === 'system' ? 'neutral' : 'ink'}>
              {row.actorType === 'system' ? 'آلي' : 'بشري'}
            </Badge>

            {/* العنوان يُقارن خانةً بخانة — لاتينيّ معزول */}
            <span dir="ltr" className="font-num text-3xs opacity-65">
              {row.ip ?? '—'}
            </span>
          </MonitorRow>
        ))}
      </MonitorList>
    
      <ListFooter
        shown={rows.length}
        total={null}
        note="السجل مضاف فقط"
        can="القراءة والترشيح والبحث."
        cannot="تعديل سطر أو حذفه. سجل ينقح ليس سجلا، وقيمته كلها في أنه لا ينقض."
      />
    </AdminShell>
  );
}

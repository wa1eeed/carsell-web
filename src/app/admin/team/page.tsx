import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { MonitorCards } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { PERMISSION_LIST, can } from '@/lib/domain/permissions';
import { teamMembers, teamStats } from '@/lib/domain/admin-team';
import { ROLE_HEAD } from '@/lib/labels/permissions';
import { TeamTable } from './TeamTable';
import { PermissionMatrix } from './PermissionMatrix';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الفريق والصلاحيات' };

/**
 * A35 — الفريق والصلاحيات.
 *
 * **ستّة أدوار ومصفوفةٌ واحدة** في `permissions.ts` ولا شاشة تعرضها —
 * فمن يريد أن يعرف ماذا يرى `OPS` يقرأ الشيفرة. والمصفوفة قرارُ
 * حَوكمةٍ يُراجَع لا تفصيلُ تنفيذ.
 */
export default async function AdminTeamPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'team.manage')) redirect('/admin');

  const [rows, stats] = await Promise.all([teamMembers(), teamStats()]);

  return (
    <AdminShell title="الفريق والصلاحيات"
      subtitle="الأدوار ومصفوفة الصلاحيات" activeHref="/admin/team" admin={admin}>
      {/*
        **والباب يُسمّى لا يُشار إليه.** كانت تقول «ذلك يمرّ بمتغيّرات
        النشر» ولا تقول أيّها — فمن أراد أن يضيف `FINANCE` لم يجد
        المتغيّر ولا صيغته، وشرطٌ يُفرَض ولا بابَ لاستيفائه قفلٌ بلا
        مفتاح.
      */}
      <div className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        <p>
          من في الفريق وبأي دور. <b>ولا يُنشأ عضو ولا يُرفع دور من هنا</b> — ذلك يمرّ
          بمتغيّرات النشر، فمن سرق جلسةً لا يصنع لنفسه حسابًا ثانيًا.
        </p>
        <p className="mt-1.5">
          والإضافة بـ<code className="font-num text-2xs opacity-80" dir="ltr">ADMIN_TEAM</code> في
          لوحة النشر، صيغتُها{' '}
          <code className="font-num text-2xs opacity-80" dir="ltr">
            email:ROLE:password
          </code>{' '}
          مفصولةً بفاصلة منقوطة. وتُطبَّق عند الإقلاع، وتبديلُ الدور يُبطل جلسات صاحبه.
        </p>
      </div>

      <MonitorCards
        cards={[
          {
            title: 'أعضاء',
            value: stats.members,
            /**
             * **والعدد المعروض هو المعرَّف لا المشغول.** كانت تقول
             * «أدوار (٣)» فتُقرأ «في النظام ثلاثة أدوار» — والمصفوفة
             * أسفلها تعرض ستّة. والتصميم يكتبها «من ٦ أدوار».
             *
             * والستّة مكتوبةٌ لا مُقحَمة: البوابة ١٤ تمنع إقحام رقمٍ
             * تليه كلمةٌ عربية **لأن الجمع لا يُصحَّح بالتبديل** —
             * «من ٢ أدوار» خطأٌ لا يُصلحه تحويل الخانة. والقيمة
             * يحرسها `admin-copy.test.ts`.
             */
            note: 'من ٦ أدوار',
          },
          {
            title: 'جلسات نشطة',
            value: stats.activeSessions,
            /**
             * «صلاحيتها ساعات (٨)» كانت تفاديًا للجمع بقوسين، والتصميم
             * يكتبها «صلاحية ٨ ساعات». والثماني مكتوبةٌ كأختَيها —
             * و`admin-provision.test.ts` يحرس الثابت.
             */
            note: 'صلاحيتها ٨ ساعات',
          },
          { title: 'حسابات مقفلة', value: stats.locked, note: 'بعد محاولات فاشلة' },
          { title: 'الصلاحيات', value: PERMISSION_LIST.length, note: 'في المصفوفة' },
        ]}
      />

      <h2 className="mb-3.5 text-sm font-bold">الأعضاء</h2>
      <TeamTable rows={rows} meId={admin.id} />

      {/*
        **والدور الشاغر يُسمّى.** المصفوفة تحكم ستّة أدوار، وثلاثةٌ
        منها قد لا يملكها أحد — فصفٌّ كاملٌ فيها نظريّ، ومن يراجع
        «من يستطيع الإفراج عن ضمان» يحسب أن هناك مالية.

        ولا يُعدّ العدد: «دور شاغر» و«دوران شاغران» و«٣ أدوار شاغرة»
        ثلاث صيغ، وجملةٌ يبنيها قالبٌ تُصيب واحدةً منها. فالتسمية
        تُغني عن العدّ — وهي أنفع: أيُّها الشاغر لا كم.
      */}
      {stats.emptyRoles.length === 0 ? null : (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-3xs opacity-55">
          <span>أدوار بلا عضو — صفوفُها في المصفوفة أدناه نظريّة:</span>
          {stats.emptyRoles.map((role) => (
            <span key={role} className="font-num rounded-md bg-ink/8 px-2 py-0.5" dir="ltr">
              {ROLE_HEAD[role]}
            </span>
          ))}
        </p>
      )}

      {/*
        **المصفوفة تُعرض لأنها قرار حَوكمة.** ومن يراجع «من يستطيع
        الإفراج عن ضمان» لا ينبغي أن يفتح ملف شيفرة ليعرف.
      */}
      {/*
        **المصفوفة تُعرض لأنها قرار حَوكمة.** ومن يراجع «من يستطيع
        الإفراج عن ضمان» لا ينبغي أن يفتح ملف شيفرة ليعرف — **وكانت
        تعرض `escrow.release`**، أي ملفَ الشيفرة في نافذةٍ أجمل.
      */}
      <h2 className="mt-10 mb-1.5 text-sm font-bold">مصفوفة الصلاحيات</h2>
      <p className="mb-3.5 text-3xs opacity-50">
        قراءةٌ لا تبديل — المصفوفة في الشيفرة تُراجَع في مراجعتها، لا صفوفًا في قاعدة.
      </p>
      <PermissionMatrix />

      <p className="mt-4 flex flex-wrap items-center gap-5 text-3xs opacity-55">
        {[
          { label: 'قراءة وكتابة', track: 'bg-accent', knob: 'end-0.5' },
          { label: 'قراءة فقط', track: 'bg-accent-200', knob: 'start-2.5' },
          { label: 'لا يرى البند أصلًا', track: 'bg-ink/15', knob: 'start-0.5' },
        ].map((row) => (
          <span key={row.label} className="flex items-center gap-2">
            <span className={`relative inline-block h-5 w-9 rounded-full ${row.track}`}>
              <span className={`absolute top-0.5 ${row.knob} size-4 rounded-full bg-bg`} />
            </span>
            {row.label}
          </span>
        ))}
      </p>

      {/*
        ═══ وبطاقتا القاعدة — وكانتا غائبتين ═══

        التصميم يُنهي الشاشة بهما، وهما موضع القاعدة التي تحكم اللوحة
        كلّها. **ونصُّهما يُكتب ممّا يقع لا ممّا رُسم**: التصميم يقول
        «TOTP إلزاميّ للجميع» وقد أُلغيت المصادقة الثنائية بقرار
        المصمّم، فذكرُها وعدٌ بحمايةٍ غير قائمة — وهو أسوأ من غيابها.
        ويقول «إعادة التعيين من SUPER_ADMIN» والتعيين يمرّ بمتغيّرات
        النشر لا بعضوٍ في اللوحة.

        والأرقام (٥ و١٥) مكتوبةٌ بصيغتها العربية الصحيحة لقيمتَيهما،
        و`admin-copy.test.ts` يحرس القيمتين: من بدّل ثابتًا يسقط عنده
        الاختبار بالسطر الذي يحتاج تصحيحًا.
      */}
      <div className="mt-8 flex flex-wrap items-start gap-4">
        <div className="min-w-2xs flex-1 rounded-xl border border-line bg-surface px-5 py-5">
          <h3 className="mb-2 text-xs font-bold">البنود تُخفى لا تُعطَّل</h3>
          <p className="text-2xs leading-loose opacity-70">
            عرض بندٍ لا يملكه الدور يكشف بنية اللوحة لمن لا يستطيع استعمالها. والفحص في
            الخادم لا في الواجهة — الإخفاء تجربة، والمنع حماية.
          </p>
        </div>
        {/* والثانية مقيَّدة العرض كما في التصميم — والأولى تأخذ ما بقي */}
        <div className="min-w-2xs max-w-md flex-1 rounded-xl border border-line px-5 py-5">
          <h3 className="mb-3 text-3xs font-bold tracking-wider opacity-45">لا استثناء فيها</h3>
          <p className="text-2xs leading-loose opacity-70">
            لا تسجيل ذاتيّ ولا استرجاع كلمة بالبريد · ٥ محاولات فاشلة ⇒ قفل ١٥ دقيقة ·
            تبديل الكلمة أو الدور يُبطل جلسات العضو فورًا · وكل تعيينٍ يُكتب في سجل التدقيق.
          </p>
        </div>
      </div>

    </AdminShell>
  );
}

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  DetailCard,
  DetailColumns,
  DetailHeader,
  DetailStats,
  Field,
} from '@/components/admin/DetailShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { PERMISSION_LIST, can, canWrite } from '@/lib/domain/permissions';
import { memberDetail } from '@/lib/domain/admin-team';
import { PERMISSION_LABEL, ROLE_LABEL } from '@/lib/labels/permissions';
import { AUDIT_ACTION_LABEL } from '@/lib/labels/audit';
import { AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'عضو الفريق' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * ═══ عضوٌ واحد — و«ماذا فعل فلان؟» لم يكن يُسأل ═══
 *
 * شاشةُ التدقيق تصفّي بالصنف (مال · هوية · صلاحيات) **ولا تصفّي
 * بالفاعل**، فأوّلُ سؤالٍ في أيّ تحقيق لا جواب له في اللوحة. وصفُّ
 * الفريق يقول اسمًا ودورًا وعددَ جلسات، ولا يقول من أين دخل ولا ماذا
 * فعل ولا ما الذي يملكه دورُه فعلًا.
 */
export default async function AdminTeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'team.manage')) redirect('/admin');

  const { id } = await params;
  const member = await memberDetail(decodeURIComponent(id));
  if (member === null) notFound();

  /**
   * **والصلاحيةُ تُحسب من الدور لا تُنسخ**: المصفوفة في الشيفرة،
   * فجدولٌ مكتوبٌ بجوارها يتباعد عنها أوّل تغيير.
   */
  const granted = PERMISSION_LIST.filter((permission) => can(member.role, permission));
  const writable = granted.filter((permission) => canWrite(member.role, permission));

  return (
    <AdminShell title="عضو الفريق" activeHref="/admin/team" admin={admin}>
      <DetailHeader
        backHref="/admin/team"
        backLabel="الفريق والصلاحيات"
        reference={member.email}
        title={member.name}
        badges={
          <>
            <Badge tone="ink">{ROLE_LABEL[member.role] ?? member.role}</Badge>
            {member.id !== admin.id ? null : (
              <Badge tone="neutral" size="sm">
                أنت
              </Badge>
            )}
            {!member.locked ? null : <Badge tone="danger">مقفل</Badge>}
            {member.status === 'active' ? null : <Badge tone="warn">{member.status}</Badge>}
          </>
        }
      />

      <DetailStats
        items={[
          { label: 'إجراءات مسجلة', value: <ArabicNumber value={member.actionCount} /> },
          {
            label: 'جلسات حية',
            value: <ArabicNumber value={member.activeSessions} />,
            ...(member.activeSessions > 1 ? { tone: 'warn' as const } : {}),
          },
          { label: 'صلاحيات يراها', value: <ArabicNumber value={granted.length} /> },
          { label: 'منها بكتابة', value: <ArabicNumber value={writable.length} /> },
        ]}
      />

      <DetailColumns
        main={
          <>
            {/*
              ═══ ماذا فعل — وهو سببُ هذه الصفحة ═══

              سجلُّ التدقيق مرتَّبٌ بالزمن ومصفًّى بالصنف، فمن أراد
              إجراءات عضوٍ بعينه قرأ مئةً وعشرين سطرًا بعينه.
            */}
            <DetailCard
              title="ماذا فعل"
              note={
                member.actionCount > member.actions.length ? (
                  <>
                    آخر <Quantity unit="auditActions" count={member.actions.length} /> من
                    أصل <ArabicNumber value={member.actionCount} />
                  </>
                ) : (
                  'الأحدث أولا'
                )
              }
            >
              {member.actions.length === 0 ? (
                <p className="text-2xs opacity-70">لم يسجل له إجراء بعد.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {member.actions.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                      {/*
                        **والمفتاحُ الخامّ يبقى لما لا تسمية له**: سطرٌ
                        يقول `listing.review.approve` أوضح من «إجراء».
                      */}
                      <span className="min-w-0 flex-1 text-2xs">
                        {AUDIT_ACTION_LABEL[row.action] ?? row.action}
                      </span>
                      <span dir="ltr" className="bidi-ltr font-num text-3xs opacity-65">
                        {row.entity}
                      </span>
                      <span className="bidi-isolate text-3xs opacity-65">
                        {riyadh.format(new Date(row.createdAt))}
                      </span>
                      {row.ip === null ? null : (
                        <span dir="ltr" className="font-num text-3xs opacity-65">
                          {row.ip}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </DetailCard>

            {/*
              **والجلسةُ تُقرأ بأينَ ومتى** — عددٌ وحده لا يكشف حسابًا
              مشتركًا، وعنوانان في وقتٍ واحد يكشفانه.
            */}
            <DetailCard title="الجلسات" note="الحية أولا، ثم ما انتهى">
              {member.sessions.length === 0 ? (
                <p className="text-2xs opacity-70">لم يدخل من أي جهاز بعد.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {[...member.sessions]
                    .sort((a, b) => Number(b.live) - Number(a.live))
                    .map((session) => (
                      <li
                        key={session.id}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                      >
                        <span dir="ltr" className="font-num text-2xs">
                          {session.ip ?? '—'}
                        </span>
                        <span className="bidi-isolate min-w-0 flex-1 truncate text-3xs opacity-65">
                          {session.userAgent ?? 'بلا متصفح مسجل'}
                        </span>
                        <span className="bidi-isolate text-3xs opacity-65">
                          {riyadh.format(new Date(session.createdAt))}
                        </span>
                        <Badge tone={session.live ? 'accent' : 'neutral'} size="sm">
                          {session.live
                            ? 'حية'
                            : session.revokedAt !== null
                              ? 'أبطلت'
                              : 'انتهت'}
                        </Badge>
                      </li>
                    ))}
                </ul>
              )}
            </DetailCard>
          </>
        }
        side={
          <>
            <DetailCard title="الحساب">
              <Field label="البريد" value={member.email} ltr />
              <Field label="الدور" value={ROLE_LABEL[member.role] ?? member.role} />
              <Field
                label="آخر ظهور"
                value={
                  member.lastSeenAt === null
                    ? 'لم يدخل بعد'
                    : riyadh.format(new Date(member.lastSeenAt))
                }
              />
              <Field
                label="كلمة المرور بدلت"
                value={riyadh.format(new Date(member.passwordChangedAt))}
              />
              <Field
                label="يطالب بتبديلها"
                value={member.mustChangePassword ? 'نعم' : 'لا'}
              />
              <Field
                label="محاولات فاشلة"
                value={<ArabicNumber value={member.failedAttempts} />}
              />
              {member.lockedUntil === null ? null : (
                <Field label="مقفل حتى" value={riyadh.format(new Date(member.lockedUntil))} />
              )}
            </DetailCard>

            {/*
              **والصلاحيةُ تُقرأ من المصفوفة لا من جدولٍ بجوارها** —
              فما يُعرض هنا هو ما يفحصه الحارس نفسُه.
            */}
            <DetailCard
              title="ما يملكه دوره"
              note={<>قراءة وكتابة بالخط العريض</>}
            >
              {granted.length === 0 ? (
                <p className="text-2xs opacity-70">لا يرى شيئا — دور بلا صلاحيات.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {granted.map((permission) => (
                    <li
                      key={permission}
                      className={`text-2xs ${
 writable.includes(permission) ? 'font-bold' : 'opacity-75'
                      }`}
                    >
                      {PERMISSION_LABEL[permission] ?? permission}
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/admin/team"
                className="mt-3 inline-block py-1 text-2xs opacity-75 hover:opacity-100"
              >
                مصفوفة الصلاحيات كاملة
              </Link>
            </DetailCard>

            <DetailCard title="ما لا يقع من هنا">
              <p className="text-2xs leading-loose opacity-75">
                الدور لا يرفع ولا يخفض من اللوحة، ولا ينشأ عضو. ذلك من متغيرات
                النشر، فمن سرق جلسة لا يصنع لنفسه حسابا ثانيا ولا يرفع دوره.
              </p>
            </DetailCard>
          </>
        }
      />
    </AdminShell>
  );
}

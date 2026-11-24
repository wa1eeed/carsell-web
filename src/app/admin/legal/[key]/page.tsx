import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { legalEditor, toDraft } from '@/lib/domain/admin-legal';
import { AR_DATE_LOCALE, displayDigits } from '@/lib/arabic';
import { DraftEditor } from '../DraftEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تعديل مستند قانوني' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

/**
 * A34 — محرّرُ المستند، وما يفتحه زرُّ «تعديل».
 *
 * **ولم يكن له زرّ.** الشاشة كانت تعرض النسخ وتكتب في حاشيتها «ولهذا
 * لا زرّ تحريرٍ هنا» — وذلك تفسيرٌ لغيابٍ لا قاعدةٌ من الترميز: الترميز
 * يضع «تعديل» على كل صفّ، وقاعدتُه أنّ التعديل **يُنشئ نسخةً** لا أنه
 * ممنوع.
 */
export default async function AdminLegalDocumentPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const { key } = await params;
  const state = await legalEditor(key);
  if (state === null) notFound();

  /**
   * **والمسوّدةُ تُولد من المنشور**: محرّرٌ يُفتح فارغًا يجعل تصحيحَ
   * سطرٍ إعادةَ كتابةِ مستندٍ كامل.
   */
  const draft = toDraft(state.draft ?? state.current);

  return (
    <AdminShell
      title={state.titleAr}
      subtitle={
        <>
          {state.published === null ? (
            'لم ينشر بعد'
          ) : (
            <>
              المنشورة <span className="font-num">{displayDigits(state.published.version)}</span> ·
              تسري من {riyadh.format(new Date(state.published.effectiveAt))}
            </>
          )}
        </>
      }
      activeHref="/admin/legal"
      admin={admin}
      actions={
        <div className="flex shrink-0 items-center gap-2">
          <LinkButton href="/admin/legal/history" variant="ghost" size="sm">
            سجل النسخ
          </LinkButton>
          <LinkButton href="/admin/legal" variant="ghost" size="sm">
            رجوع
          </LinkButton>
        </div>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <Badge tone={state.active ? 'accent' : 'neutral'}>
          {state.active ? 'منشور' : 'غير منشور'}
        </Badge>
        {state.requiredAtSignup ? <Badge tone="accent">إلزامي للتسجيل</Badge> : null}
        {state.draft === null ? null : (
          <Badge tone="warn">مسودة {displayDigits(state.draft.version)}</Badge>
        )}
        <span className="text-3xs opacity-70">
          <Quantity unit="docSections" count={draft.sections.length} />
        </span>
      </div>

      <p className="mb-6 max-w-xl text-2xs leading-loose opacity-70">
        ما يحفظ هنا <b>مسودة</b>: المنشور لا يمس حتى تنشرها. ونشرها يحفظ السابقة
        بتاريخها لأن سجل قبول من قبلها يشير إليها.
      </p>

      <DraftEditor
        docKey={state.key}
        draft={draft}
        hasDraft={state.draft !== null}
        creating={false}
        publishedVersion={state.published?.version ?? null}
        draftVersion={state.draft?.version ?? null}
        acceptances={state.published?.acceptances ?? 0}
      />
    </AdminShell>
  );
}

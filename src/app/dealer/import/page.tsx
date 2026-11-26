import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { resolveEntitlements } from '@/lib/domain/entitlements';
import { IMPORT_COLUMN_KEYS } from '@/lib/domain/dealer-import';
import { IMPORT_COLUMN_AR } from '@/lib/labels/dealer';
import { DealerShell } from '@/components/dealer/DealerShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/Button';
import { InventoryTabs } from '../inventory/InventoryTabs';
import { ImportPanel } from './ImportPanel';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'الإضافة الجماعية — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D3` — الإضافة الجماعية ═══
 *
 * **والرفعُ الجماعيّ قدرةُ باقة** (`bulk_upload`): والبندُ ظاهرٌ في
 * المِلاحة لمن لا يملكه، فالشاشةُ **تقول السبب ولا تردّ صامتةً** —
 * وبابٌ يُفتح ثمّ يقول «ممنوع» بلا سببٍ يجعل صاحبَه يحسب النظام
 * معطّلًا.
 */
export default async function DealerImport() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (actor.role !== 'OWNER' && actor.role !== 'MANAGER') redirect('/dealer');

  const grants = await resolveEntitlements({ userId: actor.userId, dealerId: actor.dealerId });
  const allowed = grants['bulk_upload'] === true;

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/inventory"
      title="المخزون"
      subtitle="ملف واحد بمطابقة أعمدة — والصفوف السليمة تستورد ولو تعطب غيرها"
    >
      {/*
        **واللسانُ يقول أين هو** — والشاشةُ صارت قسمًا من المخزون لا
        بندًا بجواره، فيبقى البندُ المضيءُ في الشريط «المركبات».
      */}
      <InventoryTabs active="import" />

      {!allowed ? (
        <EmptyState
          title="الرفع الجماعي غير مشمول في باقتك"
          description="أضف مركباتك من المخزون واحدة واحدة، أو راسلنا لترقية الباقة."
          action={
            <LinkButton href="/dealer/subscription" variant="outline" size="sm">
              اعرض باقتك
            </LinkButton>
          }
        />
      ) : (
        <>
          <ImportPanel templateHref="/api/v1/dealer/import/template" />

          <section className="mt-6 rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-3 text-3xs font-bold tracking-wide opacity-70">الأعمدة المقروءة</h2>
            <p className="flex flex-wrap gap-2 text-3xs">
              {IMPORT_COLUMN_KEYS.map((key) => (
                <span key={key} className="rounded-md bg-ink/8 px-2.5 py-1">
                  {IMPORT_COLUMN_AR[key]}
                </span>
              ))}
            </p>
            <p className="mt-4 text-2xs leading-loose opacity-75">
              الاستيراد ذري على مستوى الصف: السليمة تدخل والمعطوبة تترك مع سببها — لا يلغى
              الملف كله بسبب صف. والمستوردة تدخل مسودات، ولا تنشر قبل إضافة الصور.
              والمواصفة — الهيكل وناقل الحركة والوقود والدفع — تجلب من الفئة في الكتالوج،
              فعمود الفئة مطلوب للمركبة الجديدة.
            </p>
          </section>
        </>
      )}
    </DealerShell>
  );
}

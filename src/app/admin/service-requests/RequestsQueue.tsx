import { EmptyState } from '@/components/ui/EmptyState';
import { ServiceRequestCard } from '@/components/admin/ServiceRequestCard';
import type { ServiceRequestRow } from '@/lib/domain/admin-services';

/**
 * **المتجاوز بارز** — لونًا وترتيبًا ومرشِّحًا (معيار A6).
 *
 * والمرشِّحُ هنا **ليس زرًّا بحالةٍ محلّية**. كان كذلك: زرُّ «المتجاوزة
 * فقط» يرشّح في الذاكرة، فصارت على الشاشة ثلاثةُ ضوابط للمعنى الواحد
 * — بطاقةٌ تعدّ، ورابطٌ في العنوان، وهذا الزرّ — ولا يعرف أحدها
 * بالآخر: تنقر البطاقةَ فيُرشَّح الجدولُ والزرُّ يقول إنه مُطفأ.
 *
 * وصار المرشِّحُ البطاقةَ نفسها: حالةٌ في العنوان تُشارَك وتُحفظ وتعود
 * بزرّ الرجوع، ويُرشَّح بها الاستعلام لا الصفوف المجلوبة — فالعدّادُ
 * والقائمةُ يقرآن تعريفًا واحدًا.
 */
export function RequestsQueue({
  requests,
  scoped,
}: {
  requests: readonly ServiceRequestRow[];
  /** أمرشَّحٌ الطابور؟ — فالفراغُ حينها نتيجةُ مرشّحٍ لا طابورٌ خالٍ. */
  scoped: boolean;
}) {
  if (requests.length === 0) {
    return (
      <EmptyState
        title={scoped ? 'لا طلبات في هذا المرشّح' : 'لا طلبات هنا'}
        description={
          scoped
            ? 'أزِل المرشّح لرؤية بقيّة القائمة.'
            : 'حين يطلب عميلٌ خدمةً تظهر هنا بموعدها ومهلتها.'
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {requests.map((request) => (
        <ServiceRequestCard key={request.ref} row={request} />
      ))}
    </div>
  );
}

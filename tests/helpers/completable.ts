import { db } from '@/lib/db';
import { COMPLETION_FIELDS, completionFormFor } from '@/lib/domain/completion-schema';
import { saveCompletion } from '@/lib/domain/service-completion';

/**
 * ═══ يجعل الطلبَ قابلًا للإنهاء ═══
 *
 * `applyStep('complete')` صار يرفض `FORM_INCOMPLETE` ما لم يكتمل إثباتُ
 * الإنجاز — و`form` كان مكتوبًا في الجدول ولا يُفرَض، **فكلُّ اختبارٍ
 * يقيس ما بعد الإنجاز** (الدفتر والفاتورة والتحصيل والإخطار) كان يمرّ
 * من باب لم يكن مغلقًا.
 *
 * **وطقمٌ واحد لا سبعة**: الشرطُ الجديد يُستوفى في موضعٍ واحد، فحقلٌ
 * يُضاف إلى المخطّط لا يُسقط ثمانية اختبارات في ملفّات أربعة.
 *
 * ومعياره: **ما يمرّ به المزوّد فعلًا** — `saveCompletion` نفسها لا
 * كتابةً مباشرة في الجدول، فلو تبدّل التحقّق سقط الطقم معه.
 */
export async function makeCompletable(ref: string): Promise<void> {
  const request = await db.serviceRequest.findUniqueOrThrow({
    where: { ref },
    select: {
      id: true,
      providerId: true,
      vehicleId: true,
      service: { select: { providerType: true } },
    },
  });

  const type = request.service.providerType;
  if (type === null) return;
  const kind = completionFormFor(type);
  if (kind === null) return;

  if (kind === 'INSPECTION') {
    /**
     * **والمسوّدة تُزرع مُقدَّمةً** — ومشيُ النموذج كلِّه (بنودٌ ولوحاتٌ
     * وصور) موضوعُ `tests/inspection-*.test.ts`، لا شرطًا على كل
     * اختبارٍ يقيس الدفتر. وتُحذف بالتعاقب مع الطلب.
     */
    const template = await db.inspectionTemplate.findFirstOrThrow({
      where: { isActive: true },
      select: { id: true },
    });
    await db.inspectionDraft.upsert({
      where: { serviceRequestId: request.id },
      create: {
        serviceRequestId: request.id,
        templateId: template.id,
        vehicleId: request.vehicleId ?? '',
        providerId: request.providerId ?? '',
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
      update: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    return;
  }

  /** وأقلُّ ما يصحّ من المخطّط — فالطقم يتبع الحقول ولا يُعيد كتابتها */
  const values: Record<string, string> = {};
  for (const field of COMPLETION_FIELDS[type]) {
    if (!field.required) continue;
    values[field.key] = sample(field.type, field.options);
  }
  const saved = await saveCompletion(
    { ref, providerId: request.providerId ?? '', values },
    new Date(),
  );
  if (!saved.ok) throw new Error(`تعذّر تجهيز إثبات ${type}: ${JSON.stringify(saved)}`);
}

function sample(type: string, options: readonly string[] | undefined): string {
  switch (type) {
    case 'NUMBER':
    case 'MONEY':
      return '100';
    case 'DATE':
      /** **وأمسِ لا اليوم**: حقلٌ بـ`notBefore` يحتاج سابقًا، واليومُ يقبل الطرفين */
      return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    case 'SELECT':
      return options?.[0] ?? '';
    case 'TEXTAREA':
      return 'أُنجز العمل المطلوب على المركبة وسُلّمت إلى صاحبها.';
    default:
      return 'قيمةُ اختبار';
  }
}

import { STAGE_LABEL } from './charts';

/**
 * ═══ حال الطلب في وسمٍ واحد — تسميات اللوحة ═══
 *
 * **والإلغاء حالةٌ لا مرحلة** (قرار المصمّم ١٧، ٢٠٢٦-٠٨-٠٢): الطلب يبقى
 * عند المرحلة التي مات فيها، فيُقرأ «أُلغي عند الدفع» لا «أُلغي».
 *
 * وكانت اللوحة تعرض وسمين متجاورين: `order.status` خامًّا بالإنجليزية
 * (`CANCELLED`) وبجواره تسمية المرحلة («الدفع») — **فيقرأ المشغّل
 * جملتين تنفي كلٌّ منهما الأخرى**، ويبني عليهما قرارًا.
 *
 * ═══ وموضعُها `labels` لا مكوّنٌ مشترك ═══
 *
 * فـ`OrderStatusBadge` في واجهة الموقع يقرأ حزمة `enums` عبر
 * `next-intl`، **واللوحة عربيةٌ ثابتة بقرارٍ مسجَّل** لا تقرأ الحزمة.
 * فالقاعدة واحدة والتسميات اثنتان — وهذا ما يمنع خمسَ نسخٍ في خمس شاشات.
 */
const STOPPED_AT: Record<string, string> = {
  REQUEST: 'عند الطلب',
  APPROVED: 'عند الموافقة',
  INSPECTION: 'عند الفحص',
  PAYMENT: 'عند الدفع',
  TRANSFER: 'عند نقل الملكية',
  DONE: 'عند الإنهاء',
};

const STOPPED: Record<string, { verb: string; tone: 'accent' | 'warn' | 'neutral' }> = {
  COMPLETED: { verb: 'مكتمل', tone: 'accent' },
  CANCELLED: { verb: 'أُلغي', tone: 'neutral' },
  STALLED: { verb: 'توقّف', tone: 'warn' },
  DISPUTED: { verb: 'نزاع', tone: 'warn' },
};

export type OrderStateLabel = { text: string; tone: 'accent' | 'warn' | 'neutral' };

/**
 * `ACTIVE` يُقرأ بمرحلته — هي ما ينتظره الطلب. وغيرُها حالٌ تتقدّم
 * المرحلة وتُقيّدها. **وحالٌ لا نعرفها تُقرأ باسمها** ولا تُخفى: إخفاء
 * ما لم يُتوقَّع يجعل الصفّ يقول «الدفع» عن حالٍ سادسة تُضاف غدًا.
 */
export function orderStateLabel(status: string, stage: string): OrderStateLabel {
  if (status === 'ACTIVE') {
    return { text: STAGE_LABEL[stage] ?? stage, tone: 'neutral' };
  }

  const stopped = STOPPED[status];
  if (stopped === undefined) return { text: status, tone: 'neutral' };

  /** والمكتمل لا يُقال «عند الإنهاء» — تمامُه هو مرحلتُه. */
  if (status === 'COMPLETED') return { text: stopped.verb, tone: stopped.tone };

  const at = STOPPED_AT[stage];
  return {
    text: at === undefined ? stopped.verb : `${stopped.verb} ${at}`,
    tone: stopped.tone,
  };
}

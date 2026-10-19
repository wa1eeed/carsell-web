import type { WebhookOutcome } from '@/generated/prisma/enums';
import type { BadgeTone } from '@/components/ui/Badge';

/**
 * ═══ تسميةُ ما ترتّب على الويبهوك ═══
 *
 * **والخريطةُ تحمل تعهّدَ تعدادها** (البوابة ٥٩): قيمةٌ تُضاف بلا
 * تسمية تُعرض خامًا أو لا تُعرض — وقع في قوالب الإشعار، ثمّ في
 * حسابات الدفتر، ثمّ في `TRANSFER` في شاشة الصرف.
 *
 * **والتسميةُ تقول ما يعنيه الصفُّ للمشغّل لا ما يسمّيه المخطّط**:
 * «مهمَل» لا تقول شيئًا، و«نوع لا يقابله حال عندنا» تقول كلَّ شيء.
 */
export const WEBHOOK_OUTCOME: Record<WebhookOutcome, string> = {
  RECEIVED: 'وصل ولم يكتمل',
  APPLIED: 'طبق على الدفعة',
  UNMAPPED: 'نوع لا يقابله حال عندنا',
  REFUSED: 'رفضه النظام',
  BAD_SIGNATURE: 'توقيع لا يطابق',
};

/** شرحُ كلّ حال — سطرٌ يقرؤه من لا يعرف المسار. */
export const WEBHOOK_OUTCOME_HINT: Record<WebhookOutcome, string> = {
  RECEIVED: 'سجل قبل المعالجة ولم يغلق — أي أن المعالجة توقفت في منتصفها.',
  APPLIED: 'غير حال الدفعة فعلا، والحال الجديد في العمود المجاور.',
  UNMAPPED: 'وصل وسجل ولم يغير شيئا — لا يقابله حال في دفتر الضمان.',
  REFUSED: 'قابله حال ورفضه النظام — غالبا ويبهوك متأخر لا يقلب فشلا نجاحا.',
  BAD_SIGNATURE: 'مرجعه دفعة عندنا وتوقيعه لا يطابق. سلسلة منه تعني مفتاحا دور خطأ أو من يجرب.',
};

/** لونُ الشارة — والرفضُ ليس خطأً بالضرورة، فلا يُصبغ أحمرَ بلا سبب. */
export const WEBHOOK_OUTCOME_TONE: Record<WebhookOutcome, BadgeTone> = {
  RECEIVED: 'warn',
  APPLIED: 'accent',
  UNMAPPED: 'neutral',
  REFUSED: 'warn',
  BAD_SIGNATURE: 'danger',
};

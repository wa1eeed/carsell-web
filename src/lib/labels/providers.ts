import type { ProviderType } from '@/generated/prisma/enums';

/**
 * تسميات أنواع المزوّدين (A28) — **هنا لا في النطاق** (البوابة ١٧).
 *
 * والملف بلا `db` عمدًا: `ProviderTable` مكوّن عميل يستورده — والاستيراد
 * **نوعٌ فقط**، فلا يجرّ شيئًا إلى حزمة المتصفّح.
 *
 * ═══ ومفتاحُها التعداد لا `string` ═══
 *
 * كانت `Record<string, string>`، فأُضيف `TRANSFER` إلى التعداد ولم
 * تُضَف تسميتُه — **ولا شيء يشتكي**: الفهرسة بنصٍّ تُعيد `undefined`،
 * فعرضت شاشةُ الصرف «وكيل نقل الملكية · » وصفًّا بلا صنف. وهو صنفُ
 * «قيمةُ تعدادٍ بلا تسمية» الذي أُغلق في حسابات الدفتر بالبوابة، وهنا
 * **المُصرِّف أرخص من بوابة**: `Record<ProviderType, string>` يرفض
 * البناء حتى تُكتب التسمية.
 */
export const PROVIDER_TYPE_LABEL: Record<ProviderType, string> = {
  INSPECTION: 'فحص',
  SHIPPING: 'شحن',
  INSURANCE: 'تأمين',
  TRANSFER: 'نقل ملكية',
  DETAILING: 'تلميع',
  PHOTOGRAPHY: 'تصوير',
  FINANCE: 'تمويل',
  OTHER: 'أخرى',
};

import { isProduction } from '@/lib/env';
import type { IntegrationEnv } from '@/generated/prisma/enums';

/**
 * ═══ قرار ٣٣ ═══ **staging مقيَّد بـ`test` في الكود لا بالانضباط.**
 *
 * الانضباط يعني أن أحدهم يتذكّر ألّا يبدّل البيئة على staging. وهو
 * يتذكّر ثلاث مرّات وينسى الرابعة، ويكون قد نسي على مفتاح دفعٍ حيّ.
 *
 * فالحقل `activeEnv` يُقرأ في الإنتاج وحده. وخارجه لا يُقرأ أصلًا —
 * لا يُقرأ ثم يُتجاهَل: الأوّل بابٌ مغلق، والثاني بابٌ يُغلق بشرط،
 * وشرطٌ واحد خطأ يفتحه.
 */
export function effectiveEnvironment(stored: IntegrationEnv): IntegrationEnv {
  return isProduction ? stored : 'TEST';
}

/** هل البيئة المخزَّنة هي المستعملة فعلًا؟ الشاشة تقولها بدل أن تُوهم. */
export function environmentIsForced(stored: IntegrationEnv): boolean {
  return !isProduction && stored !== 'TEST';
}

export const ENV_LABEL: Record<IntegrationEnv, string> = {
  TEST: 'اختبار',
  LIVE: 'إنتاج',
};

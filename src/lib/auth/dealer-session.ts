import { cookies } from 'next/headers';
import { resolveDealerSession, type DealerActor } from '@/lib/domain/dealer-auth';
import { isDevelopment } from '@/lib/env';

/**
 * كوكي لوحة المعرض — **ثالثٌ لا ثاني**.
 *
 * `carsell_session` للمتجر، و`carsell_admin` لفريق المنصّة، وهذا
 * للوحة المعرض. و`sameSite=strict` كالأدمن: اللوحةُ لا تُقصد من
 * روابط خارجية.
 *
 * ═══ و`path` يعمّ — وكان `/dealer` فكسر كلَّ كتابة ═══
 *
 * ضيّقتُه قصدًا: «كوكي لا يُرسَل مع كل طلبِ صفحةٍ عامّة أضيقُ سطحًا».
 * **ومسارُ الكوكي يُطابَق بالبادئة**، و`/dealer` لا يبلغ
 * `/api/v1/dealer/...` — فمسارات اللوحة كلُّها تردّ ٤٠١: الدعوةُ
 * والتصديرُ وقرارُ المزاد وحفظُ الملفّ والاستيراد والردود.
 *
 * **والصفحاتُ كانت تعمل**، فبدا كلُّ شيء سليمًا: مكوّنُ الخادم يقرأ
 * الكوكي مباشرةً، والمسارُ يقرؤه من طلبٍ لم يحمله. فالعطلُ **في
 * الكتابة وحدها**، ولا يظهر إلّا بالضغط على زرّ — وكشفَه النقر لا
 * اختبار.
 *
 * وما اشتراه التضييق قليل: `httpOnly` يمنع القراءة بالسكربت،
 * و`sameSite=strict` يمنع الإرسالَ من موقعٍ آخر. والأدمن والمزوّد
 * كلاهما على `'/'` منذ بُنيا.
 */
export const DEALER_COOKIE = 'carsell_dealer';

export async function currentDealer(): Promise<DealerActor | null> {
  const store = await cookies();
  const token = store.get(DEALER_COOKIE)?.value;
  if (token === undefined || token === '') return null;
  return resolveDealerSession(token);
}

export function dealerCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: !isDevelopment,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

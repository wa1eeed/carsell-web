'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * ═══ تحديثٌ دوريّ لصفحةٍ تُقرأ لا تُملأ ═══
 *
 * مجرى النشاط يُفتح ويُترك مفتوحًا على شاشةٍ جانبية، وصفحةٌ ساكنة
 * تكذب بعد دقيقة: تقول «لا نزاع» وقد فُتح اثنان.
 *
 * **ولا تحديثَ لتبويبةٍ مخفيّة**: من ترك الصفحة وذهب لا يُنادى الخادم
 * من أجله كلّ نصف دقيقة، وعند عودته يُحدَّث فورًا.
 *
 * و`router.refresh()` لا يفقد موضع التمرير ولا يُعيد تحميل الصفحة —
 * يعيد تصيير مكوّنات الخادم وحدها.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = (): void => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = setInterval(tick, seconds * 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [router, seconds]);

  return null;
}

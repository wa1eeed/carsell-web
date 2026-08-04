import type { MetadataRoute } from 'next';
import { APP_URL, isProduction } from '@/lib/env';

/**
 * **الخاصّ لا يُفهرَس** — وصفحات الحساب والطلبات تحمل `noindex` في
 * ترويستها أيضًا. والاثنان معًا لأن `robots.txt` يمنع الزحف لا الفهرسة:
 * رابطٌ مُشار إليه من الخارج يُفهرَس بلا زحف.
 */
export default function robots(): MetadataRoute.Robots {
  /**
   * ═══ ما ليس إنتاجًا لا يُفهرَس — كلّه ═══
   *
   * وstaging تُنشَر ببياناتٍ مزروعة: عشرات الإعلانات بأسعار وأرقام
   * هياكل وهمية. وفهرستُها **على النطاق الحقيقيّ** تُدخل إعلانات لا
   * وجود لها في نتائج البحث، ثم تنافس الإعلانات الحقيقية حين تأتي —
   * وإخراجها من الفهرس يأخذ أسابيع لا ساعات.
   *
   * والحدّ على `APP_ENV` لا على النطاق: من ينشر staging على نطاق
   * الإنتاج يبقى محميًّا، ومن يبدّل النطاق لا يُبطل الحماية سهوًا.
   */
  if (!isProduction) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/ar/account', '/en/account', '/ar/auth', '/en/auth'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}

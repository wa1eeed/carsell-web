import type { MetadataRoute } from 'next';

/**
 * **الخاصّ لا يُفهرَس** — وصفحات الحساب والطلبات تحمل `noindex` في
 * ترويستها أيضًا. والاثنان معًا لأن `robots.txt` يمنع الزحف لا الفهرسة:
 * رابطٌ مُشار إليه من الخارج يُفهرَس بلا زحف.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/ar/account', '/en/account', '/ar/auth', '/en/auth'],
      },
    ],
    sitemap: 'https://carsell.one/sitemap.xml',
  };
}

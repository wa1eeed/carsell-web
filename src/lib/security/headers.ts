/**
 * **استيرادٌ نسبيّ عمدًا — ولا يُحوَّل إلى `@/`.**
 *
 * هذا الملفّ يقرؤه `next.config.ts`، و`next` يترجم الإعداد **خارج
 * سياق المسارات المختصرة**: فـ`@/lib/env` تصل إليه حرفيًّا فيسقط
 * الخادم عند الإقلاع بـ`Cannot find module './src/lib/env'` — ورسالةٌ
 * تتّهم مسارًا لا وجود له.
 *
 * و`env.ts` لا يستورد شيئًا، فالسلسلة تنتهي عنده.
 */
import { APP_ENV } from '../env';

/**
 * ═══ رؤوس الأمان — مصدرٌ واحد ═══
 *
 * **ولم يكن في المنصّة رأسٌ واحد.** سوقٌ يحمل مدفوعاتٍ وأرقام هويّات
 * وحساب ضمان كان يُخدَم بلا `nosniff` ولا `CSP` ولا منعِ تأطير — فأيّ
 * نصٍّ يُحقن في صفحة يُنفَّذ، وأيّ موقعٍ يضع لوحتنا في إطارٍ شفّاف
 * يسرق نقرات الأدمن.
 *
 * ═══ ولماذا هنا لا في `next.config` ═══
 *
 * `CSP` تحتاج **قيمةً لكل طلب** (الـnonce)، وملفّ الإعداد يُقيَّم مرّة
 * عند الإقلاع. فالثابت في الإعداد، والمتغيّر في الوسيط — والقائمة
 * **مكتوبةٌ هنا مرّةً** يقرؤها الاثنان، فلا تتباعد نسختان.
 */

/**
 * رؤوسٌ لا تتغيّر بطلب — تُضاف في `next.config` فتشمل كل مسار:
 * الصفحات والـAPI والملفّات الساكنة.
 */
export function staticSecurityHeaders(): { key: string; value: string }[] {
  const headers = [
    /**
     * **المتصفّح لا يخمّن النوع.** رفعُ ملفٍّ يُخدَم `image/jpeg`
     * يُشمّ نصًّا برمجيًّا لو بدا كذلك — وهذا هو الطريق المعتاد من
     * «رفعُ صورة» إلى «تنفيذُ نصّ على نطاقنا».
     */
    { key: 'X-Content-Type-Options', value: 'nosniff' },

    /**
     * **ولا يُسرَّب المسار إلى طرفٍ آخر.** مرجعٌ كامل من
     * `/account/orders/ORD-2026-0042` إلى موقعٍ خارجيّ يُخرج رقم طلبٍ
     * في سجلّات غيرنا. والأصل نفسه يبقى كاملًا فلا تنكسر قياساتنا.
     */
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

    /**
     * **ولا تُؤطَّر صفحاتنا.** `frame-ancestors` في الـCSP تغطّيه،
     * وهذا للمتصفّحات التي تسبقها — وكلاهما يمنع سرقة النقر.
     */
    { key: 'X-Frame-Options', value: 'DENY' },

    /**
     * قدراتٌ لا يستعملها المنتج — **فتُغلق قبل أن تُستعمل**. ولو
     * احتاجت شاشةُ البيع الكاميرا يومًا فُتحت لها وحدها على `self`.
     */
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    },

    /** نافذةٌ نفتحها لا تملك مرجعًا إلينا — يمنع `window.opener`. */
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },

    /** موردُنا لا يُضمَّن في موقعٍ آخر إلّا بإذن. */
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  ];

  /**
   * ═══ HSTS على الإنتاج وحده ═══
   *
   * **ولا تُرسَل على مضيفٍ محلّي أبدًا**: المتصفّح يحفظها للنطاق كلّه
   * بمدّتها، فتُعطِّل `http://localhost` على كل مشروعٍ آخر للمطوّر —
   * وإبطالها يحتاج إعدادًا داخليًّا في المتصفّح لا مسحَ ذاكرة.
   *
   * والحدّ `APP_ENV` لا `NODE_ENV`: الثاني يساوي `production` في
   * staging أيضًا، و**staging قد تُفتح على `http` أثناء الإعداد**.
   */
  if (APP_ENV === 'production') {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    });
  }

  return headers;
}

/**
 * سياسة المحتوى — **بـnonce لكل طلب**.
 *
 * ولا `'unsafe-inline'` للنصوص: نصٌّ مُحقَن في صفحةٍ تحمل سياسةً بلا
 * nonce يُنفَّذ، والسياسةُ حينئذٍ زينة. و`next` يضع الـnonce على
 * نصوصه حين يجده في الرأس.
 *
 * **و`'unsafe-inline'` للأنماط تبقى**: `next` يحقن أنماطًا داخلية
 * أثناء الترطيب، ومنعُها يكسر الصفحة — والخطر فيها أقلّ بكثير (نمطٌ
 * لا ينفّذ شيئًا).
 *
 * وفي التطوير يُضاف `'unsafe-eval'`: إعادةُ التحميل السريع تبنيه،
 * ومنعُه يُسقط خادم التطوير — ولا يصل الإنتاج لأن الحدّ `APP_ENV`.
 */
export function contentSecurityPolicy(nonce: string): string {
  const scripts = [
    "'self'",
    `'nonce-${nonce}'`,
    /** يسمح للنصوص التي يحمّلها نصٌّ موثَّق — يحتاجه `next` لقطعه. */
    "'strict-dynamic'",
    ...(APP_ENV === 'development' ? ["'unsafe-eval'"] : []),
  ].join(' ');

  return [
    "default-src 'self'",
    `script-src ${scripts}`,
    "style-src 'self' 'unsafe-inline'",
    /** `data:` للصور المولَّدة في الشاشة، و`blob:` لمعاينة ما يُرفع. */
    "img-src 'self' data: blob:",
    "font-src 'self'",
    /** البوابة والبثّ الحيّ — ولا شيء غيرهما. */
    "connect-src 'self' ws: wss:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    /** يرقّي أيّ موردٍ بقي على `http` بدل أن يُسقطه. */
    ...(APP_ENV === 'development' ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

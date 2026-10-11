import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE, isLocale, routing } from '@/i18n/routing';
import { contentSecurityPolicy } from '@/lib/security/headers';

const handleI18nRouting = createMiddleware(routing);

/**
 * ═══ سياسة المحتوى بـnonce لكل طلب ═══
 *
 * **والسياسة بلا nonce زينة**: `'unsafe-inline'` تسمح بأيّ نصٍّ
 * يُحقَن، وهو ما تمنعه السياسة أصلًا.
 *
 * ═══ ويُكتب في الطلب والاستجابة معًا ═══
 *
 * المتصفّح يحتاجه في **الاستجابة** ليطبّق السياسة، و`next` يقرؤه من
 * **الطلب** ليضعه على نصوصه هو. وكتابتُه في واحدةٍ دون الأخرى تُنتج
 * عطلين متعاكسين: إمّا سياسةٌ لا تُطبَّق، أو صفحةٌ بيضاء لأن نصوص
 * الإطار نفسها مُنعت.
 */
function forwardedHeaders(request: NextRequest, policy: string, nonce: string): Headers {
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  return headers;
}

export default function middleware(request: NextRequest) {
  /**
   * `crypto.randomUUID` متاحةٌ في بيئة الحافة — ولا تُستورَد
   * `node:crypto` هنا، فالوسيط لا يعمل على Node.
   */
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const policy = contentSecurityPolicy(nonce);
  const headers = forwardedHeaders(request, policy, nonce);

  const sealed = (response: NextResponse): NextResponse => {
    response.headers.set('Content-Security-Policy', policy);
    return response;
  };

  const { pathname } = request.nextUrl;

  /**
   * لوحة الأدمن والـAPI خارج توجيه اللغة — **ولا تخرجان من السياسة**.
   * وهما أخطر ما في المنتج: الأولى تحمل الصلاحيات، والثاني المال.
   */
  if (pathname.startsWith('/admin') || pathname.startsWith('/api')) {
    return sealed(NextResponse.next({ request: { headers } }));
  }

  /**
   * الجذر وحده يقرأ الاختيار المعلن.
   * لا استنتاج من `accept-language` — من لم يبدّل بنفسه يصل إلى العربية.
   * أي مسار آخر يحمل لغته في رابطه، فلا يتدخّل الكوكي فيه أبدًا.
   */
  if (pathname === '/') {
    const chosen = request.cookies.get(LOCALE_COOKIE)?.value;
    if (chosen !== undefined && isLocale(chosen)) {
      const target = new URL(`/${chosen}`, request.url);
      target.search = request.nextUrl.search;
      return sealed(NextResponse.redirect(target));
    }
  }

  /**
   * **والطلب يُعاد بناؤه بالرؤوس المضافة**: توجيه اللغة يقرأ الطلب
   * الذي يصله، فلو مُرّر الأصليّ لم يصل الـnonce إلى `next` وبقيت
   * نصوصه بلا إذن.
   */
  return sealed(handleI18nRouting(new NextRequest(request, { headers })));
}

export const config = {
  /**
   * ═══ يشمل `/admin` و`/api` ═══
   *
   * كانا مستثنيين لأنهما خارج توجيه اللغة — **فخرجا من سياسة المحتوى
   * أيضًا**، وهما أخطر ما في المنتج. والوسيط يفرّقهما داخله فلا يمسّهما
   * توجيه اللغة.
   *
   * ويبقى `_next` والملفّات الساكنة خارجه: رؤوسُها الثابتة من
   * `next.config` تشملها، والسياسة لا معنى لها على أصلٍ غير HTML.
   */
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
};

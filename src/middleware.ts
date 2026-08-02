import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, isLocale, routing } from '@/i18n/routing';

const handleI18nRouting = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  /**
   * الجذر وحده يقرأ الاختيار المعلن.
   * لا استنتاج من `accept-language` — من لم يبدّل بنفسه يصل إلى العربية.
   * أي مسار آخر يحمل لغته في رابطه، فلا يتدخّل الكوكي فيه أبدًا.
   */
  if (request.nextUrl.pathname === '/') {
    const chosen = request.cookies.get(LOCALE_COOKIE)?.value;
    if (chosen !== undefined && isLocale(chosen)) {
      const target = new URL(`/${chosen}`, request.url);
      target.search = request.nextUrl.search;
      return NextResponse.redirect(target);
    }
  }

  return handleI18nRouting(request);
}

export const config = {
  /**
   * الويب العام وحده يحمل بادئة اللغة.
   * مستثنى: /admin (لوحة الأدمن — عربية فقط في المرحلة الأولى،
   * أداة داخلية بلا ترجمة)، و/api، و/_next، والملفات الساكنة.
   */
  matcher: ['/((?!api|admin|_next|_vercel|.*\\..*).*)'],
};

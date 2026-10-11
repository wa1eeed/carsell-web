import { NextResponse, type NextRequest } from 'next/server';
import { recordClick } from '@/lib/domain/ads';

export const runtime = 'nodejs';

/**
 * `GET /api/v1/ads/{id}/click` — تَعُدّ ثمّ تُحوّل.
 *
 * **ولا يُعطى `targetUrl` للمتصفّح مباشرةً.** `search_inline` تُسعَّر
 * `cpc` — فالنقرة بندُ فاتورة، ورابطٌ يذهب إلى المعلن من غير مرورٍ
 * بنا يجعلنا نبيع ما لا نَعُدّ.
 *
 * ═══ و٣٠٢ لا ٣٠٨ ═══
 *
 * الوجهة تتبدّل بتبدّل الحملة، ومحرّكُ بحثٍ يحفظ تحويلًا دائمًا إلى
 * معلنٍ انتهت حملته يُهدي رابطَنا لمن لم يعد يدفع. و`nofollow` على
 * الرابط نفسه في الشاشة.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const target = await recordClick(id);

  // حملةٌ لا وجود لها أو وجهةٌ فاسدة ⇒ إلى البحث، لا إلى صفحة خطأ
  return NextResponse.redirect(target ?? new URL('/ar/cars', _request.url).toString(), 302);
}

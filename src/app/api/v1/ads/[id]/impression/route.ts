import { NextResponse, type NextRequest } from 'next/server';
import { isHomeCampaign, recordImpression } from '@/lib/domain/ads';
import {
  AD_SESSION_COOKIE,
  afterImpression,
  seenAds,
  HOME_SESSION_AD_CAP,
} from '@/lib/domain/ad-session';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/ads/{id}/impression` — ظهورٌ وقع.
 *
 * **ويُنادى حين تدخل البطاقة مجال الرؤية لا حين تُصيَّر.** والفرق
 * مالٌ في المساحات المسعَّرة `cpm`: صفحةٌ صُيِّرت وما نزل إليها أحد
 * ليست ظهورًا، وعدُّها بيعُ ما لم يُرَ.
 *
 * ويُنادى بـ`sendBeacon` فلا يحبس التنقّل، وردُّه ٢٠٤ بلا جسد.
 *
 * ═══ وهنا يُكتب عدّادُ سقف الجلسة ═══
 *
 * الوسيطُ يقرأ الكوكي ويمرّر الباقي إلى الصفحة، **وهذا المسار يكتبه**
 * — فالصفحةُ مكوّنُ خادمٍ يقرأ ولا يكتب كوكيًّا. وبهما معًا يصير
 * السقفُ مفروضًا في الخادم كما يقول ترميز A30، لا في التطبيق حيث
 * يُتجاوَز بإعادة تحميلٍ أو بنسخةٍ معدَّلة.
 *
 * **والعدُّ على ما ظهر لا على ما طُلب**: هي القاعدة نفسُها التي بُني
 * عليها هذا المسار أصلًا.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await recordImpression(id);

  /**
   * **وسقفُ الرئيسية لمساحاتها وحدها.** بطاقةُ المموّل في النتائج
   * والبنرُ داخل صفحة السيارة لكلٍّ منهما `maxPerSession` الخاصّ به،
   * وعدُّها في سقف الرئيسية يُسكت إعلانًا بيع بشروطٍ أخرى.
   */
  const response = new NextResponse(null, { status: 204 });
  if (!(await isHomeCampaign(id))) return response;

  const raw = request.cookies.get(AD_SESSION_COOKIE)?.value;
  // بلغ السقفَ ⇒ لا كتابةَ، فلا يتجدّد عمرُ الكوكي بلا سبب
  if (seenAds(raw) >= HOME_SESSION_AD_CAP) return response;

  response.cookies.set({
    name: AD_SESSION_COOKIE,
    value: afterImpression(raw),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    // **بلا `maxAge`** — كوكي جلسةٍ ينتهي بإغلاق المتصفّح، والترميز يقول «جلسة»
  });
  return response;
}

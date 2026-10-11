import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { buyNow } from '@/lib/domain/auction-order';

export const runtime = 'nodejs';

const MESSAGES: Record<string, { ar: string; en: string }> = {
  AUCTION_NOT_FOUND: { ar: 'لا مزاد على هذه المركبة.', en: 'No auction on this listing.' },
  NOT_LIVE: { ar: 'المزاد غير مفتوح الآن.', en: 'This auction is not open.' },
  BUY_NOW_UNAVAILABLE: {
    // القاعدة ١٠ — ويُقال سببُها، فاختفاءٌ بلا تفسير يُقرأ عطلًا
    ar: 'الشراء الفوري لم يعد متاحًا — بلغت المزايدات سعر البيع.',
    en: 'Buy now is no longer available — bidding has met the reserve.',
  },
  OWN_LISTING: { ar: 'لا تشترِ مركبتك.', en: 'You cannot buy your own vehicle.' },
  PROFILE_INCOMPLETE: {
    ar: 'أكمل بريدك وتوثيق هويتك قبل الشراء.',
    en: 'Complete your email and identity before buying.',
  },
  TAX_STATUS_REQUIRED: { ar: 'حدّد وضعك الضريبي أوّلًا.', en: 'Set your tax status first.' },
  ORDER_EXISTS: { ar: 'على هذه المركبة طلبٌ قائم.', en: 'This vehicle already has an order.' },
  LISTING_UNAVAILABLE: { ar: 'الإعلان لم يعد متاحًا.', en: 'This listing is no longer available.' },
};

/**
 * `POST /api/v1/auctions/{ref}/buy-now` — الشراء الفوري.
 *
 * **ولم يكن له وجود.** البائع يضبط السعر في معالج البيع ويُخزَّن،
 * والقاعدة ١٠ تحكم ظهوره، **والزرّ معروضٌ في لوحة المزايدة** — وضغطُه
 * يُخرج «الشراء الفوري قريبًا». و`OrderSource.BUY_NOW` معرَّفٌ بلا كاتب.
 *
 * فبائعٌ يضبط سعرًا فوريًّا يُوعَد ببيعٍ لا يقع، ومشترٍ يراه يُوعَد
 * بشراءٍ لا يقع.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const viewer = await currentUser(request);
  if (viewer === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const { ref } = await params;
  const result = await buyNow({ listingRef: ref, buyerId: viewer.id });

  if (!result.ok) {
    const entry = MESSAGES[result.reason];
    return fail(
      {
        code: `BUY_NOW_${result.reason}`,
        messageAr: entry?.ar ?? 'تعذّر الشراء الفوري.',
        messageEn: entry?.en ?? 'Could not complete the purchase.',
      },
      result.reason === 'AUCTION_NOT_FOUND' ? 404 : 422,
    );
  }

  /**
   * ═══ والوجهة تُعطى — وتُفتَح قبل أن تُعطى ═══
   *
   * الطلب يُنشأ في مرحلة «دفع» بمهلة، فتركُ المشتري على شاشة المزاد
   * بعد نجاحٍ يجعله يبحث عمّا يدفع به والمهلة تجري.
   *
   * **وأوّل صياغةٍ أرسلت `/orders/{ref}` — وهو ٤٠٤.** المسار القائم
   * `/account/orders/{ref}`، وكُشف بمشي الرحلة لا بقراءتها: الشراء
   * نجح، والطلب صحيح، والمشتري يصل إلى لا شيء.
   */
  return ok({
    orderRef: result.orderRef,
    amount: result.amount,
    next: `/account/orders/${result.orderRef}`,
  });
}

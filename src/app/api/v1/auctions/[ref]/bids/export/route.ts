import { getAuction } from '@/lib/domain/auctions';
import { bidLogCsv } from '@/lib/domain/auction-export';

export const runtime = 'nodejs';
// السجلّ يُقرأ لحظة طلبه — ومزادٌ حيّ يتغيّر كل دقيقة
export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/auctions/{ref}/bids/export` — سجلُّ المزايدات CSV.
 *
 * ═══ ويحمل ما تحمله الشاشة لا أكثر ═══
 *
 * **بلا حارس** لأنّ الصفحة بلا حارس: الأسماءُ مستعارة (`#U-7`) ولا
 * هويّةَ ولا معرّفَ مستخدم، فالملفُّ لا يُفشي ما لا يُفشيه الجدولُ
 * فوقه. **ولو حُرس لكان حارسًا على نسخةٍ من شيءٍ مفتوح** — وهو
 * الشكل الذي يُطمئن ولا يمنع.
 *
 * ومن يتابع إغلاقًا يحتاج الصفوف ليحسبها، لا لقطةَ شاشة.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const auction = await getAuction(decodeURIComponent(ref));
  if (auction === null) return new Response('not found', { status: 404 });

  return new Response(bidLogCsv(auction), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="bids-${auction.listingRef}.csv"`,
      'cache-control': 'no-store',
    },
  });
}

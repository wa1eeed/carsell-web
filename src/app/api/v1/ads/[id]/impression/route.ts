import { NextResponse, type NextRequest } from 'next/server';
import { recordImpression } from '@/lib/domain/ads';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/ads/{id}/impression` — ظهورٌ وقع.
 *
 * **ويُنادى حين تدخل البطاقة مجال الرؤية لا حين تُصيَّر.** والفرق
 * مالٌ في المساحات المسعَّرة `cpm`: صفحةٌ صُيِّرت وما نزل إليها أحد
 * ليست ظهورًا، وعدُّها بيعُ ما لم يُرَ.
 *
 * ويُنادى بـ`sendBeacon` فلا يحبس التنقّل، وردُّه ٢٠٤ بلا جسد.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await recordImpression(id);
  return new NextResponse(null, { status: 204 });
}

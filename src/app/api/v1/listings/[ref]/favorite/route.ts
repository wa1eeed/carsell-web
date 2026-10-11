import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { toggleFavorite } from '@/lib/domain/favorites';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/listings/{ref}/favorite` — يقلب حال المفضّلة.
 *
 * **ولم يكن له وجود.** المفضّلة تُقرأ في صفحتها، وتُعدّ في بطاقة
 * الحساب، ويستهدفها ترشيحُ الحملات — ولا قلبَ في بطاقةٍ ولا صفحة.
 *
 * وقلبُ الحال في مسارٍ واحد لا `POST`/`DELETE`: الشبكة تُعيد الطلب،
 * وزرُّ القلب لا يعرف حاله قبل الضغط في شبكةٍ من عشرين بطاقة — فعمليةٌ
 * تقلب أسلمُ من اثنتين تتسابقان.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const { ref } = await params;
  const result = await toggleFavorite(user.id, ref);

  if (!result.ok) {
    return fail(
      {
        code: 'LISTING_NOT_FOUND',
        messageAr: 'الإعلان غير موجود.',
        messageEn: 'Listing not found.',
      },
      404,
    );
  }

  return ok({ favorited: result.favorited });
}

import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { submitInspection } from '@/lib/domain/inspection-review';

export const runtime = 'nodejs';

/**
 * `POST .../inspection/submit` — الفاحصُ يُرسل، واللقطةُ تُجمَّد.
 *
 * **وبعدها لا يعدّلها** إلّا أن تُعاد إليه بملاحظة.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const user = await currentProviderUser();
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const { ref } = await params;
  const result = await submitInspection({
    ref: decodeURIComponent(ref),
    providerId: user.providerId,
  });

  if (!result.ok) {
    if (result.reason === 'NOT_YOURS') return fail(ERRORS.NOT_FOUND, 404);
    /** **والناقصُ يُقال بعدده** — «غير مكتمل» لا تقول للفاحص أين يعود. */
    return fail(
      ERRORS.VALIDATION({
        inspection: result.reason,
        ...(result.missing === undefined ? {} : { missing: String(result.missing) }),
      }),
      422,
    );
  }

  return ok({ score: result.score, grade: result.grade, flagged: result.flagged });
}

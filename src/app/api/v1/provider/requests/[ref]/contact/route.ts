import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { revealRequestPhone } from '@/lib/domain/provider-queue';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/provider/requests/{ref}/contact` — كشفُ رقم.
 *
 * **و`POST` لا `GET`** — كما في كشف الهوية: `GET` يُخزَّن في سجلّ
 * المتصفّح ويُعاد بالرجوع ويُستدعى مسبقًا، فيقع الكشف بلا قصد
 * ويُسجَّل مرارًا بلا سبب.
 */
const Body = z.object({ party: z.enum(['requester', 'keeper']) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await currentProviderUser();
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ party: 'REQUIRED' }), 422);

  const { ref } = await params;
  const result = await revealRequestPhone({
    ref: decodeURIComponent(ref),
    party: parsed.data.party,
    providerId: user.providerId,
    providerUserId: user.id,
    ip: request.headers.get('x-forwarded-for'),
  });

  /**
   * **وغيرُ صاحبه يرى ٤٠٤** — أن يعرف مزوّدٌ أنّ المرجع قائمٌ لغيره
   * معلومةٌ لا تلزمه، وهي مسلكُ الطلب نفسه في `providerRequestView`.
   */
  if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);

  return ok({ phone: result.phone });
}

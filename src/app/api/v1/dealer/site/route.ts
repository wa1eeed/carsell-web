import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { DEALER_MODULE, dealerHasModule } from '@/lib/domain/dealer-modules';
import { saveDealerSite } from '@/lib/domain/dealer-site';

export const runtime = 'nodejs';

const Body = z.object({
  slug: z.string().min(1).max(60),
  tagline: z.string().max(120).nullable().optional(),
  accent: z.string().max(7).nullable().optional(),
  visible: z.boolean(),
  customDomain: z.string().max(253).nullable().optional(),
});

const MESSAGES: Record<string, { ar: string; en: string }> = {
  SLUG_TAKEN: { ar: 'هذا العنوان مأخوذ — اختر غيره.', en: 'That address is taken.' },
  DOMAIN_TAKEN: { ar: 'هذا الدومين مسجل لمعرض آخر.', en: 'That domain belongs to another showroom.' },
};

/**
 * `POST /api/v1/dealer/site` — إعدادُ موقع المعرض.
 *
 * **ولمالكه وحده**: هويّةُ المنشأة ودومينُها قرارُ صاحب السجلّ، لا قرارُ
 * بائعٍ ولا محاسب.
 */
export async function POST(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!(await dealerHasModule(actor, DEALER_MODULE.landing))) return fail(ERRORS.FORBIDDEN, 403);
  if (actor.role !== 'OWNER') return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const result = await saveDealerSite(
    { userId: actor.userId, dealerId: actor.dealerId },
    {
      slug: parsed.data.slug,
      tagline: parsed.data.tagline ?? null,
      accent: parsed.data.accent ?? null,
      visible: parsed.data.visible,
      customDomain: parsed.data.customDomain ?? null,
    },
  );

  if (!result.ok) {
    if (result.reason === 'VALIDATION') return fail(ERRORS.VALIDATION(result.fields), 422);
    const text = MESSAGES[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: text?.ar ?? 'تعذر الحفظ.',
        messageEn: text?.en ?? 'Could not save.',
      },
      409,
    );
  }

  return ok(result);
}

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentProviderUser } from '@/lib/auth/provider-session';
import {
  saveDraftHeader,
  saveDraftPanel,
  saveDraftResult,
} from '@/lib/domain/inspection-draft';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/provider/requests/{ref}/inspection` — حفظُ جزءٍ من المسودّة.
 *
 * **والحفظُ تلقائيّ بندًا بندًا**: الفاحصُ واقفٌ عند السيارة بجهازٍ
 * في يده، واستمارةٌ تُحفظ بزرٍّ واحدٍ في آخرها تُضيّع ساعةَ عملٍ بأوّل
 * انقطاع.
 *
 * **والحراسةُ في النطاق**: نوعُ المزوّد وملكيّةُ الطلب وحالُ المسودّة
 * تُفحص هناك لا هنا — فحارسٌ واحدٌ حيث يقع الأثر.
 */
const Body = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('item'),
    itemId: z.string().min(1).max(40),
    state: z.enum(['PASS', 'MINOR', 'MAJOR', 'NOT_APPLICABLE']),
    value: z.string().max(200).nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
  }),
  z.object({
    kind: z.literal('panel'),
    panel: z.string().min(1).max(40),
    condition: z.enum(['original', 'repainted', 'replaced', 'unknown']),
    microns: z.number().int().min(0).max(5000).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  }),
  z.object({
    kind: z.literal('header'),
    odometerKm: z.number().int().min(0).max(2_000_000).nullable().optional(),
    summaryAr: z.string().max(2000).nullable().optional(),
  }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const user = await currentProviderUser();
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ inspection: 'INVALID' }), 422);

  const { ref } = await params;
  const decoded = decodeURIComponent(ref);
  const body = parsed.data;

  if (body.kind === 'item') {
    const result = await saveDraftResult({
      ref: decoded,
      providerId: user.providerId,
      itemId: body.itemId,
      state: body.state,
      value: body.value ?? null,
      note: body.note ?? null,
    });
    if (!result.ok) {
      /**
       * **وغيرُ صاحبه يرى ٤٠٤** — أن يعرف مزوّدٌ أنّ المرجع قائمٌ
       * لغيره معلومةٌ لا تلزمه، وهو مسلكُ `providerRequestView`.
       * و«ليس فاحصًا» ٤٠٣: النوعُ حقيقةٌ عنه لا عن الطلب.
       */
      if (result.reason === 'NOT_INSPECTOR') return fail(ERRORS.FORBIDDEN, 403);
      if (result.reason === 'NOT_YOURS') return fail(ERRORS.NOT_FOUND, 404);
      return fail(ERRORS.VALIDATION({ inspection: result.reason }), 422);
    }
    return ok({ answered: result.answered, total: result.total });
  }

  const saved =
    body.kind === 'panel'
      ? await saveDraftPanel({
          ref: decoded,
          providerId: user.providerId,
          panel: body.panel,
          condition: body.condition,
          microns: body.microns ?? null,
          note: body.note ?? null,
        })
      : await saveDraftHeader({
          ref: decoded,
          providerId: user.providerId,
          odometerKm: body.odometerKm ?? null,
          summaryAr: body.summaryAr ?? null,
        });

  if (!saved.ok) {
    if (saved.reason === 'NOT_INSPECTOR') return fail(ERRORS.FORBIDDEN, 403);
    if (saved.reason === 'NOT_YOURS') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ inspection: saved.reason ?? 'INVALID' }), 422);
  }
  return ok({ saved: true });
}

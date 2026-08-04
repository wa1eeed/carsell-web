import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { saveAuctionSettings } from '@/lib/domain/admin-auction-settings';

export const runtime = 'nodejs';

const Body = z.object({
  maxExtensions: z.number().int().min(0).max(50),
  defaultDeposit: z.number().min(0).max(1_000_000),
  minIncrement: z.number().positive().max(100_000),
  winnerPaymentHours: z.number().int().min(1).max(720),
  hideReserve: z.boolean(),
  buyNowBeforeReserve: z.boolean(),
  durationsDays: z.array(z.number().int().min(1).max(30)).min(1).max(10),
});

const MESSAGE: Record<string, string> = {
  OUT_OF_BOUNDS: 'قيمة خارج الحدود — راجع العربون والفرق الأدنى والمهلة.',
  NO_DURATIONS: 'اختر مدّةً واحدة على الأقل، وإلّا تعذّر إنشاء أي مزاد.',
};

/** `PUT /api/v1/admin/auction-settings` — افتراضيّات المزاد (A32). */
export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ settings: 'INVALID' }), 422);

  const result = await saveAuctionSettings({
    ...parsed.data,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGE[result.reason] ?? 'تعذّر الحفظ.',
        messageEn: 'Could not save auction settings.',
      },
      422,
    );
  }

  return ok({ saved: true });
}

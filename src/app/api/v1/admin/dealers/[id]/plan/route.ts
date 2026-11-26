import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { assignDealerPlan } from '@/lib/domain/dealer-plan';

export const runtime = 'nodejs';

const Body = z.object({ planKey: z.string().min(1).max(60) });

const STATUS: Record<string, number> = {
  DEALER_NOT_FOUND: 404,
  PLAN_NOT_FOUND: 404,
  NOT_A_DEALER_PLAN: 422,
};

const MESSAGE: Record<string, string> = {
  DEALER_NOT_FOUND: 'لا معرض بهذا المعرف.',
  PLAN_NOT_FOUND: 'لا باقة بهذا المفتاح.',
  NOT_A_DEALER_PLAN: 'هذه باقة أفراد — لا تسند إلى منشأة.',
};

/**
 * `POST /api/v1/admin/dealers/{id}/plan` — إسنادُ باقةٍ إلى معرض.
 *
 * **وبه تصل الموديولزُ إلى اللوحة**: نقطةُ البيع والتقسيطُ والموقعُ
 * مفاتيحُ تمنحها الباقة، ومعرضٌ بلا اشتراكٍ يعمل بالافتراضيّات — فبقيت
 * مبنيّةً غائبةً عن كلّ شاشة حتى بُني هذا الباب.
 *
 * **والصلاحيةُ صلاحيةُ الباقات نفسُها** (`finance.view` — وهي ما يحرس
 * `/admin/plans` ومنحَ التجاوزات): فمن يملك تعديلَ الباقة يملك إسنادَها،
 * ولا تُستعار صلاحيةُ عرضِ المعرض (`users.view`) لفعلٍ يبيع.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ planKey: 'INVALID' }), 422);

  const result = await assignDealerPlan({
    adminId: guard.admin.id,
    dealerId: id,
    planKey: parsed.data.planKey,
  });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGE[result.reason] ?? 'تعذر إسناد الباقة.',
        messageEn: 'Could not assign the plan.',
      },
      STATUS[result.reason] ?? 409,
    );
  }

  return ok({ planKey: result.planKey });
}

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { MIN_REVIEW_NOTE, decideReview } from '@/lib/domain/admin-listings';
import { can } from '@/lib/domain/permissions';
import { toArabicDigits } from '@/lib/arabic';

export const runtime = 'nodejs';

const Body = z.object({
  decision: z.enum(['APPROVE', 'RETURN', 'REJECT']),
  note: z.string().max(2000).nullable().optional(),
});

const STATUS: Record<string, number> = {
  LISTING_NOT_FOUND: 404,
  NOT_IN_QUEUE: 409,
  NOTE_REQUIRED: 422,
  SUSPEND_NOT_ALLOWED: 403,
};

const MESSAGE: Record<string, string> = {
  LISTING_NOT_FOUND: 'لا إعلان بهذا المرجع.',
  NOT_IN_QUEUE: 'الإعلان لم يعد في الطابور — راجعه غيرك.',
  // الرقم عربيّ-هنديّ ومعزول، والجملة لا يحكمها المعدود
  NOTE_REQUIRED: `الملاحظة أقصر من الحدّ (${toArabicDigits(String(MIN_REVIEW_NOTE))}) — البائع يقرؤها ليُصلح.`,
  SUSPEND_NOT_ALLOWED: 'إيقاف الحساب يحتاج صلاحية أعلى.',
};

/**
 * `POST /api/v1/admin/listings/{ref}/review` — A15.
 *
 * **والرفض يفحص صلاحيةً ثانية.** المراجع يعتمد ويردّ بـ`listings.review`،
 * أمّا إيقاف الحساب فهو `users.suspend` — ولا يُوقف حسابٌ لأن مراجعًا
 * فتح إعلانًا.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const guard = await requireAdmin(request, 'listings.review');
  if (!guard.ok) return guard.response;

  const { ref } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ decision: 'INVALID' }), 422);

  const result = await decideReview({
    ref,
    decision: parsed.data.decision,
    note: parsed.data.note ?? null,
    adminId: guard.admin.id,
    ip: guard.ip,
    canSuspend: can(guard.admin.role, 'users.suspend'),
  });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGE[result.reason] ?? 'تعذّر تنفيذ القرار.',
        messageEn: 'Could not apply the review decision.',
      },
      STATUS[result.reason] ?? 409,
    );
  }

  return ok({ status: result.status });
}

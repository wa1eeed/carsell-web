import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { grantOverride } from '@/lib/domain/admin-plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ═══ `POST /api/v1/admin/overrides` — منح تجاوزٍ لعميل ═══
 *
 * `EntitlementOverride` كان **بلا كاتبٍ إطلاقًا** — تعدّه شاشة الباقات
 * وتكتب تحته «وكل تجاوزٍ يُمنح يظهر هنا بسببه ومدّته»، ولا سبيل لمنحه.
 *
 * **والسبب إلزاميّ في النطاق لا في الاستمارة**: حارسٌ في الشاشة ليس
 * حارسًا، واستثناءٌ بلا سببٍ مكتوب يُقرأ بعد سنةٍ على أنه خطأ.
 */
const Body = z.object({
  userId: z.string().min(1).max(40),
  entitlementKey: z.string().min(1).max(60),
  value: z.string().min(1).max(60),
  reason: z.string().min(4).max(500),
  /** `null` تجاوزٌ دائم — حالٌ مشروعة، ويبقى مكتوبًا بسببه فيُراجَع. */
  expiresAt: z.string().datetime().nullable(),
});

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues.slice(0, 6)) {
      fields[issue.path.join('.') || 'body'] = 'INVALID';
    }
    return fail(ERRORS.VALIDATION(fields), 422);
  }

  const result = await grantOverride({
    adminId: guard.admin.id,
    userId: parsed.data.userId,
    entitlementKey: parsed.data.entitlementKey,
    value: parsed.data.value,
    reason: parsed.data.reason,
    expiresAt: parsed.data.expiresAt === null ? null : new Date(parsed.data.expiresAt),
    ip: guard.ip ?? undefined,
  });

  if (!result.ok) return fail(ERRORS.VALIDATION({ override: result.reason }), 422);

  return ok({ id: result.id }, undefined, { status: 201 });
}

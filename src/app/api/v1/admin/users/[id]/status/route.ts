import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { MIN_STATUS_REASON, setUserStatus } from '@/lib/domain/admin-user-status';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/users/{id}/status` — إيقافُ حسابٍ ورفعُه.
 *
 * الحارس مبنيٌّ منذ اليوم الأول (الدخول يرفض `SUSPENDED` و`BANNED`)،
 * والصلاحية `users.suspend` معرَّفةٌ وممنوحةٌ لـ`SUPER_ADMIN` و`OPS`،
 * وشريحتا «موقوفون» و«محظورون» في اللوحة — **ولا شيء كان يكتب
 * `User.status`**. فقفلٌ بلا مفتاح.
 */
const Body = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']),
  reason: z.string().min(MIN_STATUS_REASON).max(500),
});

const MESSAGES: Record<string, { ar: string; en: string }> = {
  REASON_REQUIRED: {
    ar: 'اكتب سببا يقرأ لاحقا — لا كلمة واحدة.',
    en: 'Write a reason that reads later — not a single word.',
  },
  ALREADY_IN_STATUS: {
    ar: 'الحساب في هذه الحال أصلا.',
    en: 'The account is already in that state.',
  },
  LIVE_OBLIGATIONS: {
    ar: 'عليه طلب حي أو ضمان محجوز — احسم الصفقة أولا، أو أوقفه مؤقتا.',
    en: 'This account has a live order or held escrow — settle it first, or suspend instead.',
  },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request, 'users.suspend');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(ERRORS.VALIDATION({ reason: 'REQUIRED' }), 422);
  }

  const { id } = await params;
  const result = await setUserStatus({
    userId: id,
    status: parsed.data.status,
    reason: parsed.data.reason,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    if (result.reason === 'USER_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    const text = MESSAGES[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: text?.ar ?? 'تعذر تغيير حال الحساب.',
        messageEn: text?.en ?? 'Could not change the account state.',
      },
      result.reason === 'REASON_REQUIRED' ? 422 : 409,
    );
  }

  return ok(result);
}

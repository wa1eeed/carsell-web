import type { NextRequest } from 'next/server';
import { fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { revokeMemberSessions } from '@/lib/domain/admin-team';

export const runtime = 'nodejs';

/** `DELETE /api/v1/admin/team/{id}/sessions` — إنهاء جلسات عضو (A35). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request, 'team.manage');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const result = await revokeMemberSessions({
    targetId: id,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'SELF'
            ? 'لا تُنهِ جلساتك من هنا — استعمل الخروج.'
            : 'لا عضو بهذا المعرّف.',
        messageEn: 'Could not revoke sessions.',
      },
      result.reason === 'SELF' ? 422 : 404,
    );
  }

  return ok({ revoked: result.revoked });
}

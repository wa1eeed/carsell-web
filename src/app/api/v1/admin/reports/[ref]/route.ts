import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { decideReport } from '@/lib/domain/admin-reports';
import { MIN_REPORT_NOTE } from '@/lib/domain/report-rules';
import { toArabicDigits } from '@/lib/arabic';

export const runtime = 'nodejs';

const Body = z.object({
  action: z.enum(['REVIEW_LISTING', 'DISMISS', 'ACTIONED']),
  note: z.string().max(2000).nullable().optional(),
});

const STATUS: Record<string, number> = {
  REPORT_NOT_FOUND: 404,
  ALREADY_CLOSED: 409,
  NOTE_REQUIRED: 422,
  NOT_LISTING: 422,
};

const MESSAGE: Record<string, string> = {
  REPORT_NOT_FOUND: 'لا بلاغ بهذا المرجع.',
  ALREADY_CLOSED: 'البلاغ حُسم — حسمه غيرك.',
  // الرقم عربيّ-هنديّ ومعزول، والجملة لا يحكمها المعدود
  NOTE_REQUIRED: `الملاحظة أقصر من الحدّ (${toArabicDigits(String(MIN_REPORT_NOTE))}) — وتُقرأ بعد شهور.`,
  NOT_LISTING: 'الإحالة إلى المراجعة للإعلانات وحدها.',
};

/** `POST /api/v1/admin/reports/{ref}` — حسم بلاغ (A17). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const guard = await requireAdmin(request, 'reports.handle');
  if (!guard.ok) return guard.response;

  const { ref } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ action: 'INVALID' }), 422);

  const result = await decideReport({
    ref,
    action: parsed.data.action,
    note: parsed.data.note ?? null,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGE[result.reason] ?? 'تعذّر حسم البلاغ.',
        messageEn: 'Could not resolve the report.',
      },
      STATUS[result.reason] ?? 409,
    );
  }

  return ok({ status: result.status });
}

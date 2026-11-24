import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { publishDraft } from '@/lib/domain/admin-legal';

export const runtime = 'nodejs';

/**
 * ═══ `POST /api/v1/admin/legal/{key}/publish` ═══
 *
 * **ولا نصاب.** الترميز يقول «والنشر يحتاج موافقة عضوين»، وقد أُلغي
 * ذلك بقرار المالك (ROADMAP §٣٥ و§٤١) — فيقع بضغطةٍ واحدة، ويبقى له
 * صفٌّ في `AuditLog` يسمّي فاعلَه. والسجلُّ أثرٌ لا بوّابةُ سلطة.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const { key } = await context.params;
  const result = await publishDraft({ key, adminId: guard.admin.id, ip: guard.ip });

  if (!result.ok) {
    return result.reason === 'NOT_FOUND'
      ? fail(ERRORS.NOT_FOUND, 404)
      : fail(ERRORS.VALIDATION({ draft: result.reason }), 409);
  }

  return ok({ version: result.version, material: result.material });
}

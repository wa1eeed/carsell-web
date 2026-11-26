import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { previewImport, runImport } from '@/lib/domain/dealer-import';
import { resolveEntitlements } from '@/lib/domain/entitlements';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const Body = z.object({
  text: z.string().min(1).max(2_000_000),
  apply: z.boolean().default(false),
});

/**
 * ═══ الاستيراد الجماعيّ — معاينةٌ وتطبيقٌ بمسارٍ واحد ═══
 *
 * **والقارئُ واحدٌ للطورين** (قاعدةٌ مسجَّلة في استيراد الكتالوج):
 * فما عُرض هو ما يقع، ولا تفترق قراءتان.
 *
 * **والرفعُ الجماعيّ قدرةُ باقة** (`bulk_upload`): تُفحص هنا لا في
 * الشاشة وحدها — حارسٌ في العميل ليس حارسًا.
 */
export async function POST(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (actor.role !== 'OWNER' && actor.role !== 'MANAGER') return fail(ERRORS.FORBIDDEN, 403);

  const grants = await resolveEntitlements({ userId: actor.userId, dealerId: actor.dealerId });
  if (grants['bulk_upload'] !== true) {
    return fail(
      {
        code: 'BULK_UPLOAD_NOT_IN_PLAN',
        messageAr: 'الرفع الجماعي غير مشمول في باقتك — راسلنا لترقيتها.',
        messageEn: 'Bulk upload is not included in your plan.',
      },
      403,
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ text: 'REQUIRED' }), 422);

  if (!parsed.data.apply) {
    return ok(await previewImport(actor.dealerId, parsed.data.text));
  }

  const dealer = await db.dealer.findUnique({
    where: { id: actor.dealerId },
    select: { city: true },
  });
  if (dealer === null) return fail(ERRORS.NOT_FOUND, 404);

  return ok(
    await runImport({
      dealerId: actor.dealerId,
      actorId: actor.userId,
      text: parsed.data.text,
      branchId: actor.branchId,
      city: dealer.city,
    }),
  );
}

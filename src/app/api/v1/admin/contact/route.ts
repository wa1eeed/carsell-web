import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { saveContactChannels } from '@/lib/domain/admin-contact';

export const runtime = 'nodejs';

/**
 * الحقول تقبل الفراغ — **وغياب القناة قرارٌ مشروع**: من لا يملك
 * واتساب للدعم يتركه فارغًا، ولا يُلزَم بقيمةٍ وهمية.
 */
const Body = z.object({
  supportEmail: z.string().max(160),
  supportPhone: z.string().max(40),
  supportWhatsapp: z.string().max(40),
});

const MESSAGE: Record<string, string> = {
  INVALID_EMAIL: 'البريد غير صحيح — تأكد من وجود @ واسم النطاق.',
  INVALID_PHONE: 'رقم الهاتف غير صحيح — اكتبه بصيغة 05XXXXXXXX.',
  INVALID_WHATSAPP: 'رقم الواتساب غير صحيح — اكتبه بصيغة 05XXXXXXXX.',
};

/** `PUT /api/v1/admin/contact` — قنوات الدعم التي تعرضها «تواصل معنا». */
export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ contact: 'INVALID' }), 422);

  const result = await saveContactChannels({
    ...parsed.data,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGE[result.reason] ?? 'تعذر الحفظ.',
        messageEn: 'Could not save support channels.',
      },
      422,
    );
  }

  /** يُرجع ما حُفظ بعد التطبيع — فترى الشاشة الصيغة لا ما كتبتَه. */
  return ok({ saved: result.saved });
}

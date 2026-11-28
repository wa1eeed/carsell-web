import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { canWrite } from '@/lib/domain/permissions';
import { removeTemplateField, saveTemplateField } from '@/lib/domain/service-template';

export const runtime = 'nodejs';

const Option = z.object({
  value: z.string().min(1).max(60),
  labelAr: z.string().min(1).max(120),
  priceDelta: z.string().max(12).nullable(),
});

const Body = z.object({
  key: z.string().min(2).max(40),
  labelAr: z.string().min(2).max(120),
  hintAr: z.string().max(200).nullable(),
  kind: z.enum(['TEXT', 'LATIN', 'NUMBER', 'MONEY', 'DATE', 'SELECT', 'CHECKBOX', 'NOTE']),
  purpose: z.enum(['REQUEST', 'ACTION']),
  required: z.boolean(),
  maxLength: z.number().int().min(1).max(5000).nullable(),
  priceDelta: z.string().max(12).nullable(),
  options: z.array(Option).max(20),
});

const MESSAGE: Record<string, string> = {
  SERVICE_NOT_FOUND: 'لا خدمة بهذا المفتاح.',
  KEY_INVALID: 'المفتاح لاتيني صغير بلا مسافات — يخزن مع الإجابات فلا يتبدل.',
  LABEL_REQUIRED: 'اكتب اسم الحقل كما يراه العميل.',
  OPTIONS_REQUIRED: 'حقل الاختيار بلا خيارات لا يختار منه أحد.',
  PRICED_ACTION: 'حقل يملؤه المزود بعد الدفع لا يضيف على السعر.',
  DELTA_INVALID: 'الزيادة رقم موجب أو لا شيء.',
};

/**
 * `POST /api/v1/admin/services/{key}/template` — حفظُ حقلٍ في القالب.
 *
 * **والقالبُ يُحرَّر بلا نشر** (طلب المالك ٢٠٢٦-١١-٢٨): كان الفحصُ
 * وحده كذلك، وباقي الخدمات حقولُها في الشيفرة.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;
  if (!canWrite(guard.admin.role, 'services.manage')) return fail(ERRORS.FORBIDDEN, 403);

  const { key } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ key: 'INVALID' }), 422);

  const result = await saveTemplateField({ adminId: guard.admin.id }, key, parsed.data);
  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGE[result.reason] ?? 'تعذر حفظ الحقل.',
        messageEn: 'Could not save the field.',
      },
      result.reason === 'SERVICE_NOT_FOUND' ? 404 : 422,
    );
  }

  return ok({ fieldId: result.fieldId });
}

/** `DELETE …?field=key` — **ولا يمسّ إجاباتِ طلبٍ مضى**: لقطتُها معه. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;
  if (!canWrite(guard.admin.role, 'services.manage')) return fail(ERRORS.FORBIDDEN, 403);

  const { key } = await params;
  const field = new URL(request.url).searchParams.get('field') ?? '';
  if (field === '') return fail(ERRORS.VALIDATION({ field: 'REQUIRED' }), 422);

  const removed = await removeTemplateField({ adminId: guard.admin.id }, key, field);
  if (!removed) return fail(ERRORS.NOT_FOUND, 404);
  return ok({ removed: true });
}

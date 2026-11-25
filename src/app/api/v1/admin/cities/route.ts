import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentAdmin } from '@/lib/auth/admin-session';
import { canWrite } from '@/lib/domain/permissions';
import { removeCity, upsertCity } from '@/lib/domain/cities';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const Upsert = z.object({
  id: z.string().min(1).optional(),
  nameAr: z.string().min(1).max(60),
  nameEn: z.string().min(1).max(60),
  slug: z.string().min(1).max(60),
  region: z.string().min(1).max(60),
  sort: z.number().int().min(0).max(9999),
  visible: z.boolean(),
});
const Remove = z.object({ id: z.string().min(1) });

const MESSAGES: Record<string, string> = {
  NAME_REQUIRED: 'الاسم والمقطع والمنطقة مطلوبة.',
  NAME_TAKEN: 'اسم المدينة مستعمل — وهو ما يخزن في الإعلانات، فلا يتكرر.',
  SLUG_TAKEN: 'المقطع مستعمل لمدينة أخرى — وهو عنوان صفحتها.',
  NOT_FOUND: 'لم تعد هذه المدينة موجودة.',
  HAS_LISTINGS: 'عليها إعلانات — أخفها بدل حذفها، فالحذف يتركها معروضة بلا مرشح.',
};

export async function POST(request: NextRequest) {
  const admin = await currentAdmin();
  if (admin === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!canWrite(admin.role, 'catalog.manage')) return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Upsert.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ nameAr: 'REQUIRED' }), 422);

  const result = await upsertCity(parsed.data);
  if (!result.ok) {
    return fail(
      { code: result.reason, messageAr: MESSAGES[result.reason] ?? '', messageEn: result.reason },
      422,
    );
  }

  /** **وكلُّ إجراء أدمن يكتب `AuditLog`** — قاعدةٌ مُلزِمة في هذا المستودع. */
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      action: parsed.data.id === undefined ? 'city.create' : 'city.update',
      entity: 'city',
      entityId: result.id,
      after: { nameAr: parsed.data.nameAr, slug: parsed.data.slug, visible: parsed.data.visible },
    },
  });

  return ok({ id: result.id });
}

export async function DELETE(request: NextRequest) {
  const admin = await currentAdmin();
  if (admin === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!canWrite(admin.role, 'catalog.manage')) return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Remove.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ id: 'REQUIRED' }), 422);

  const result = await removeCity(parsed.data.id);
  if (!result.ok) {
    return fail(
      { code: result.reason, messageAr: MESSAGES[result.reason] ?? '', messageEn: result.reason },
      result.reason === 'NOT_FOUND' ? 404 : 409,
    );
  }

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      action: 'city.delete',
      entity: 'city',
      entityId: parsed.data.id,
    },
  });

  return ok({ removed: true });
}

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { createTrim, listTrims } from '@/lib/domain/catalog';

export const runtime = 'nodejs';

const BODY_TYPE = z.enum(['SEDAN','SUV','PICKUP','HATCHBACK','COUPE','VAN']);
const TRANSMISSION = z.enum(['AUTOMATIC','MANUAL','CVT','DCT']);
const FUEL = z.enum(['PETROL','DIESEL','HYBRID','ELECTRIC']);
const DRIVETRAIN = z.enum(['FWD','RWD','AWD','FOUR_WD']);

/** القيَم الموروثة إلزامية كلها — فئة ناقصة تُملأ فراغًا في نموذج البيع. */
const Body = z.object({
  modelId: z.string().min(1),
  nameAr: z.string().max(120),
  nameEn: z.string().max(120),
  yearFrom: z.number().int(),
  yearTo: z.number().int().nullable().optional(),
  bodyType: BODY_TYPE,
  transmission: TRANSMISSION,
  fuel: FUEL,
  drivetrain: DRIVETRAIN,
  seats: z.number().int(),
  doors: z.number().int(),
  engineL: z.string().nullable().optional(),
  cylinders: z.number().int().nullable().optional(),
  horsepower: z.number().int().nullable().optional(),
  visible: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const modelId = request.nextUrl.searchParams.get('modelId');
  if (modelId === null) return fail(ERRORS.VALIDATION({ modelId: 'REQUIRED' }), 422);

  return ok(await listTrims(modelId));
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(
      ERRORS.VALIDATION(
        Object.fromEntries(
          parsed.error.issues.map((i) => [String(i.path[0] ?? 'body'), 'REQUIRED']),
        ),
      ),
      422,
    );
  }

  const result = await createTrim(guard.admin, parsed.data, guard.ip);
  if (!result.ok) {
    return fail(
      ERRORS.VALIDATION(Object.fromEntries(result.errors.map((e) => [e.field, e.code]))),
      422,
    );
  }
  return ok(result.trim, undefined, { status: 201 });
}

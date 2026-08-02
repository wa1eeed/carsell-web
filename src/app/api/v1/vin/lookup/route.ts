import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { lookupVin } from '@/lib/domain/vin';

export const runtime = 'nodejs';

const Body = z.object({ vin: z.string().min(1).max(24) });

/**
 * `POST /api/v1/vin/lookup`
 *
 * **الفشل ليس خطأ خادم**: يعيد رمزًا يميّز «شكل غير صحيح» من «غير
 * معروف» من «معروض بالفعل»، فالشاشة تعرف أيّها تفتح الإدخال اليدوي معه
 * وأيّها توقف عنده.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ vin: 'مطلوب' }), 422);

  const result = await lookupVin(parsed.data.vin);
  if (!result.ok) {
    switch (result.reason) {
      case 'ALREADY_LISTED':
        return fail(ERRORS.VIN_ALREADY_LISTED, 409);
      case 'INVALID_FORMAT':
        return fail(ERRORS.VIN_INVALID, 422);
      default:
        return fail(ERRORS.VIN_NOT_RECOGNISED, 404);
    }
  }

  return ok(result);
}

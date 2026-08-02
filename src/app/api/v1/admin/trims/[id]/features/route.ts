import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { setTrimFeatures } from '@/lib/domain/catalog';

export const runtime = 'nodejs';

const Body = z.object({ keys: z.array(z.string().max(40)).max(60) });

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ keys: 'INVALID' }), 422);

  const { id } = await params;
  await setTrimFeatures(guard.admin, id, parsed.data.keys, guard.ip);
  return ok({ saved: true });
}

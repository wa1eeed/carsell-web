import type { NextRequest } from 'next/server';
import { ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { runMismatches } from '@/lib/domain/reconciliation';

export const runtime = 'nodejs';

/**
 * `GET .../reconciliation/{gateway}/{date}` — المعاملات المختلفة وحدها.
 *
 * وتُقرأ عند فتح التنبيه لا في القائمة: يومٌ فيه ألف اختلاف لا يُحمَّل
 * في جدولٍ يُمسح بالنظر.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gateway: string; date: string }> },
) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const { gateway, date } = await params;
  return ok(await runMismatches(gateway, date));
}

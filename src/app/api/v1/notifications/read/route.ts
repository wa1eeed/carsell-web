import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { markAllRead, markRead, unreadCount } from '@/lib/domain/notifications';

export const runtime = 'nodejs';

const Body = z.union([
  z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(200) }),
  z.object({ all: z.literal(true) }),
]);

/**
 * `POST /api/v1/notifications/read` — وضعُ علامة القراءة.
 *
 * **والملكية تُفحص في النطاق لا هنا.** `markRead` تشترط `userId` في
 * الـ`where` نفسه، فمعرّفٌ مسرَّب لا يقرأ إشعار غيره ولو نادى المسار
 * مباشرةً — وحارسٌ في المسار وحده اقتراح.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ ids: 'INVALID' }), 422);

  const marked =
    'all' in parsed.data
      ? await markAllRead(user.id)
      : await markRead(user.id, parsed.data.ids);

  return ok({ marked, unread: await unreadCount(user.id) });
}

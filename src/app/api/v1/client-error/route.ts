import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok } from '@/lib/api/response';
import { clientIp, rateLimit } from '@/lib/api/rate-limit';
import { reportError } from '@/lib/observability/report';

export const runtime = 'nodejs';

const Body = z.object({
  message: z.string().max(500),
  digest: z.string().max(80).nullable(),
});

/**
 * `POST /api/v1/client-error` — خطأ عرضٍ من المتصفّح.
 *
 * **محدودٌ بالعنوان**: مسارٌ يقبل نصًّا من أي زائر بلا حدّ يصير قناةً
 * لإغراق السجلّ حتى يُخفي فيه ما يهمّ.
 *
 * ويعيد ٢٠٠ دائمًا — الزائر يرى صفحة خطأ أصلًا، وخطأٌ ثانٍ في إبلاغه
 * لا يفيده بشيء.
 */
export async function POST(request: NextRequest) {
  const verdict = rateLimit(`client-error:${clientIp(request.headers)}`, 20, 60);
  if (!verdict.allowed) return ok({ recorded: false });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return ok({ recorded: false });

  reportError(new Error(parsed.data.message), {
    where: 'client.render',
    extra: { digest: parsed.data.digest, ua: request.headers.get('user-agent') },
  });

  return ok({ recorded: true });
}

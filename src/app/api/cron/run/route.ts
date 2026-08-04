import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runJobs } from '@/lib/jobs/run';

export const runtime = 'nodejs';
// المهل تُقاس على لحظة النداء — فلا تخزين ولا تصيير مسبق
export const dynamic = 'force-dynamic';

/**
 * `POST /api/cron/run` — تشغيل الوظائف الزمنية.
 *
 * ═══ ويُغلق عند غياب السرّ لا يُفتح ═══
 *
 * بلا `CRON_SECRET` **يردّ ٥٠٣** ولا يشتغل. ولو فُتح عند غيابه لصار
 * كل ناشرٍ ينسى ضبطه يعرّض مسارًا يُسقط عروضًا ويُلغي طلبات ويُغلق
 * مزادات — لمن عرف العنوان. والغياب حالٌ متوقّعة تُعلن نفسها، لا بابٌ
 * مفتوح.
 *
 * والمقارنة بزمنٍ ثابت: مقارنةٌ تخرج عند أوّل اختلاف تُسرّب السرّ
 * حرفًا حرفًا لمن يقيس آلاف المحاولات.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret === undefined || secret === '') return false;

  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
  if (given === '') return false;

  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret === undefined || secret === '') {
    return NextResponse.json(
      { error: { code: 'CRON_NOT_CONFIGURED', message: 'CRON_SECRET is not set.' } },
      { status: 503 },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  const run = await runJobs();

  /**
   * **فشلُ وظيفةٍ يُعاد ٥٠٠** ليعيد المُجدوِل المحاولة ويُنبّه — وردّ
   * ٢٠٠ على تشغيلٍ نصفُه ساقط يجعل العطل صامتًا إلى أن يشتكي مستخدم.
   */
  return NextResponse.json({ data: run }, { status: run.failed > 0 ? 500 : 200 });
}

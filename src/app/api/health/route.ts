import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/health` — الفحص الصحّي للحاوية.
 *
 * **يلمس القاعدة.** صفحةٌ ساكنة تردّ ٢٠٠ وقاعدتُها ساقطة، فيظنّ
 * المُنسِّق الحاوية سليمة ويوجّه إليها كل الطلبات — وكلّها تفشل.
 *
 * ولا يكشف شيئًا: لا إصدار ولا مخطّط ولا رسالة خطأ. الفحص الصحّي
 * مسارٌ عامّ، وما يُعاد فيه يُقرأ من الخارج.
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

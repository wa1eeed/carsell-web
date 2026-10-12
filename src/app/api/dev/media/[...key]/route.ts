import { NextResponse } from 'next/server';
import { devGet, devStoreAllowed } from '@/lib/storage/dev-store';

export const runtime = 'nodejs';

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

/**
 * يخدم صور التطوير من القرص — **ولا وجود له في الإنتاج**.
 *
 * الحارس هنا لا في الشاشة: مسارٌ يقرأ من القرص ويُنشر مع الحاوية يقرأ
 * ما تركه غيرك عليها. و`devGet` تردّ `null` خارج التطوير، فالطبقتان
 * تمنعان معًا — الحارس والمخزن.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  if (!devStoreAllowed()) return new NextResponse(null, { status: 404 });

  const { key } = await params;
  const body = await devGet(key.join('/'));
  if (body === null) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      /*
        **والنوع من الامتداد لا ثابتًا.** كان كلُّ ملفٍّ يُقدَّم
        `image/jpeg` — بما فيه `.webp` و`.png`. والمتصفّحات تتسامح
        بالاستنتاج، فمرّ العطل صامتًا حتى صار الملفّ ليس jpeg حقًّا.
      */
      'content-type': TYPES[key[key.length - 1]?.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream',
      // لا تخزين: الملف يُستبدل بالمفتاح نفسه أثناء التطوير
      'cache-control': 'no-store',
    },
  });
}

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { devStoreAllowed } from '@/lib/storage/dev-store';

export const runtime = 'nodejs';

/**
 * تحدّي تحقّق مُحاكى — **للتطوير وحده**.
 *
 * المُهايئ التجريبيّ يعيد `actionUrl` إلى هنا حين تُطلب طريقة
 * `test_3ds`، فيُمشى المسار الذي يقع فيه أكثر المشترين حقيقةً: صفحة
 * المُصدِر ثم العودة. وبلا هذه الصفحة يكون `actionUrl` رابطًا ميّتًا —
 * وهو ما كنّا نصلحه في غيرها.
 *
 * والحارس هنا كما في مخزن التطوير: خارجه ٤٠٤ لا صفحة.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  if (!devStoreAllowed()) return new NextResponse(null, { status: 404 });

  const { ref } = await params;
  const back = new URL(request.url).searchParams.get('return') ?? '/ar/account';

  const row = await db.sandboxTransaction.findUnique({ where: { ref } });
  if (row === null) return new NextResponse(null, { status: 404 });

  const page = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>تحقّق من بطاقتك</title>
<style>
  /* صفحة مُحاكاة خارج نظام التصميم — بلا ألوان مكتوبة، فالمتصفّح يكفي */
  body{font-family:system-ui,sans-serif;display:grid;place-items:center;
       min-height:100vh;margin:0}
  .card{border:1px solid;border-radius:12px;padding:28px;max-width:380px}
  h1{font-size:18px;margin:0 0 6px} p{font-size:13px;line-height:1.9;margin:0 0 18px}
  form{display:flex;gap:10px} button{flex:1;padding:11px;border-radius:8px;
       font-size:13px;cursor:pointer}
  code{direction:ltr;display:block;font-size:11px;opacity:.5;margin-top:14px}
</style></head><body>
<div class="card">
  <h1>تحقّق من بطاقتك</h1>
  <p>هذه صفحة تحقّق مُحاكاة في وضع التطوير. لا بطاقة حقيقية ولا مبلغ حقيقيّ.</p>
  <form method="POST">
    <button name="decision" value="approve" type="submit">أكمِل الدفع</button>
    <button name="decision" value="cancel" type="submit">إلغاء</button>
  </form>
  <code>${ref}</code>
</div>
<input type="hidden" id="back" value="${back.replace(/"/g, '&quot;')}">
</body></html>`;

  return new NextResponse(page, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * قرار التحدّي — **الإلغاء يُلغي الحجز ولا يتركه معلَّقًا**.
 * وحجزٌ يبقى بعد أن ألغى صاحبه هو مالٌ محبوس بلا سبب.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  if (!devStoreAllowed()) return new NextResponse(null, { status: 404 });

  const { ref } = await params;
  const form = await request.formData().catch(() => null);
  const approved = form?.get('decision') === 'approve';

  await db.sandboxTransaction.updateMany({
    where: { ref },
    data: { state: approved ? 'HELD' : 'CANCELLED' },
  });

  const back = new URL(request.url).searchParams.get('return') ?? '/ar/account';
  return NextResponse.redirect(new URL(back, request.url), 303);
}

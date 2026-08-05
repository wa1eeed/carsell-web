import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { specOptionsForModel, trimsWithSpecs } from '@/lib/domain/catalog-options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/trims?modelId=` — فئات طرازٍ **بمواصفاتها**، وخياراتُه.
 *
 * وتُعاد بقيَمها الموروثة: البائع يرى «فل كامل · دفع رباعي · ٧ مقاعد»
 * فيتعرّف على فئته بها لا بالاسم وحده.
 *
 * ═══ و`options` هي ما يحكم الحقول ═══
 *
 * اتّحادُ ما تعرفه فئات هذا الطراز — فلا يُعرض «كهربائي» على طرازٍ لا
 * يُصنع كذلك، ولا «يدوي» على ما لا يُصنع إلا أوتوماتيك. وكان المعالج
 * يعرض التعداد كاملًا لكل مركبة.
 */
export async function GET(request: NextRequest) {
  const modelId = request.nextUrl.searchParams.get('modelId');
  if (modelId === null || modelId === '') {
    return fail(ERRORS.VALIDATION({ modelId: 'REQUIRED' }), 422);
  }

  const [trims, options] = await Promise.all([
    trimsWithSpecs(modelId),
    specOptionsForModel(modelId),
  ]);

  return ok({ trims, options });
}

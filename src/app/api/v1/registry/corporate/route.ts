import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { lookupCorporate } from '@/lib/integrations/lean';

export const runtime = 'nodejs';

const Body = z.object({ unifiedNumber: z.string().min(1).max(24) });

/**
 * ═══ `POST /api/v1/registry/corporate` — جلبُ سجلّ المنشأة ═══
 *
 * معرضٌ يكتب سجلَّه بيده يكتبه كما يحفظه، فيُراجَع طلبُه بما كتبه لا
 * بما في السجلّ ويُردّ على فرقِ حرف. والجلب يجعل الملفّ **نسخةً من
 * الوزارة** لا إفادةَ صاحبه.
 *
 * ═══ والفشل ليس خطأ خادم ═══
 *
 * يُفرَّق «غير مضبوط» عن «غير معروف» عن «عطلٍ عندهم»: الأوّل يُبقي
 * الإدخال اليدويّ بسطرٍ رمادي ولا يُقلق أحدًا — فالتكامل خلف راية
 * والفشل هو الحال المتوقَّع. والثاني يقول للمعرض إن رقمه لا يُعرف.
 *
 * **ولا يُعاد الخام إلى المتصفّح**: فيه ما لا تحتاجه الاستمارة
 * (شركاء ورؤوس أموال)، ويُحفظ دليلًا للمراجع عند التقديم لا هنا.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ unifiedNumber: 'REQUIRED' }), 422);

  const result = await lookupCorporate(parsed.data.unifiedNumber);
  if (!result.ok) {
    return ok({ found: false, reason: result.reason });
  }

  const { raw: _raw, ...record } = result.record;
  return ok({ found: true, record });
}

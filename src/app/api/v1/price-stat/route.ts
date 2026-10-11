import type { NextRequest } from 'next/server';
import { ok } from '@/lib/api/response';
import { priceStatFor } from '@/lib/domain/listing-detail';

export const runtime = 'nodejs';

/**
 * `GET /api/v1/price-stat` — موقعُ السعر في السوق لمركبةٍ بعينها.
 *
 * **ولمَ مسارٌ لا صفحة**: معالج البيع يسأل وهو في الخطوة الثانية،
 * والطراز والسنة والمدينة حالةُ عميلٍ لم تُحفظ بعد — فلا صفحةَ خادمٍ
 * تعرفها.
 *
 * **ولا سرّ فيه**: مئيناتُ سوقٍ تُعرض على صفحة كل مركبة بالفعل
 * (`RangeBar` في Wc). والمجهول وحده يُحجب، لا المعروض.
 *
 * ويعيد `null` دون عتبة العيّنة — والشاشة حينها لا تعرض شيئًا، فلا
 * تُبنى نصيحةٌ على ستّ صفقات.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const modelId = query.get('modelId') ?? '';
  const year = Number(query.get('year'));
  const mileageKm = Number(query.get('mileageKm'));
  const city = query.get('city') ?? '';
  const trimId = query.get('trimId');

  if (modelId === '' || !Number.isFinite(year) || city === '') return ok({ stat: null });

  const stat = await priceStatFor({
    modelId,
    trimId: trimId === null || trimId === '' ? null : trimId,
    year,
    city,
    mileageKm: Number.isFinite(mileageKm) ? mileageKm : 0,
  });

  return ok({ stat });
}

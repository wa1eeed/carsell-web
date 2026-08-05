import type { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth/session';
import { setOwnListingPaused, updateOwnListing } from '@/lib/domain/seller-listing';
import { ERRORS, fail, ok } from '@/lib/api/response';
import {
  faqForListing,
  findPublishedListing,
  similarListings,
  toPublicDetail,
} from '@/lib/domain/listing-detail';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/listings/{ref}` — نفس المُسلسِل الذي تعرضه الشاشة.
 *
 * لو بنى المسار كائنه بنفسه لانحرف عن الصفحة، ولاحتاج حارس الأسرار
 * أن يُكتب مرّتين. الكتابة مرّتين هي كيف يتسرّب سرّ.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<NextResponse> {
  const { ref } = await params;
  const row = await findPublishedListing(ref);
  if (row === null) return fail(ERRORS.NOT_FOUND, 404);

  const [detail, faq, similar] = await Promise.all([
    toPublicDetail(row),
    faqForListing(row.type),
    similarListings(row),
  ]);

  return ok(detail, {
    faq,
    similar: similar.map(({ path, ...card }) => ({ ...card, path: path('ar') })),
  });
}

/**
 * ═══ وتعديل البائع لإعلانه — ولم يكن له باب ═══
 *
 * هذا المسار كان يصدّر `GET` وحده، و«مركباتي» قائمةٌ للقراءة: فمن
 * نشر إعلانًا **لا يستطيع تغيير سعره أبدًا** — وهو أوّل ما يفعله كل
 * بائع في كل سوق، ولا حيلة له إلّا أن يسحبه ويُنشئ غيره فيفقد
 * مشاهداته وترتيبه.
 */
const EditBody = z.object({
  askPrice: z.number().finite().optional(),
  negotiable: z.boolean().optional(),
  // `null` تلغي الحدّ — و`nullable` تفرّقها عن الغياب الذي يعني «لا تمسّه»
  minAcceptPrice: z.number().finite().nullable().optional(),
  city: z.string().min(1).max(80).optional(),
  paused: z.boolean().optional(),
});

const EDIT_MESSAGES: Record<string, { ar: string; en: string }> = {
  LOCKED_BY_ORDER: {
    ar: 'على هذا الإعلان طلبٌ قائم — لا يُعدَّل حتى ينتهي.',
    en: 'This listing has an active order and cannot be changed until it closes.',
  },
  NOT_EDITABLE: {
    ar: 'لا يُعدَّل الإعلان في حالته الحالية.',
    en: 'This listing cannot be changed in its current state.',
  },
  PRICE_INVALID: {
    ar: 'السعر خارج الحدّ المقبول — راجع الرقم.',
    en: 'That price is outside the accepted range.',
  },
  NOTHING_TO_CHANGE: { ar: 'لا تغيير.', en: 'Nothing to change.' },
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
): Promise<NextResponse> {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = EditBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ listing: 'INVALID' }), 422);

  const { ref } = await params;
  const { paused, ...edits } = parsed.data;

  /**
   * **والإيقاف ليس تعديلًا.** خلطُهما في نداءٍ واحد يجعل «أوقِف» و«غيّر
   * السعر» يقعان معًا أو يسقطان معًا، وهما قراران مختلفان. فإن جاءت
   * `paused` كانت هي الطلب.
   */
  const result =
    paused === undefined
      ? await updateOwnListing({ ref, sellerId: user.id, ...edits })
      : await setOwnListingPaused({ ref, sellerId: user.id, paused });

  if (!result.ok) {
    // غير المالك يرى ٤٠٤: أن يعرف غريبٌ أن المرجع قائمٌ لغيره معلومةٌ لا تلزمه
    if (result.reason === 'NOT_FOUND' || result.reason === 'NOT_OWNER') {
      return fail(ERRORS.NOT_FOUND, 404);
    }
    const text = EDIT_MESSAGES[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: text?.ar ?? 'تعذّر التعديل.',
        messageEn: text?.en ?? 'Could not apply the change.',
      },
      result.reason === 'PRICE_INVALID' || result.reason === 'NOTHING_TO_CHANGE' ? 422 : 409,
    );
  }

  return ok(result);
}

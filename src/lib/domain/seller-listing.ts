import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { pauseListing, resumeListing } from './listing-state';

/**
 * ═══ البائع يتحكّم بإعلانه ═══
 *
 * **ولم يكن يستطيع لمسه بعد النشر.** `/api/v1/listings/{ref}` يصدّر
 * `GET` وحده، و«مركباتي» قائمةٌ للقراءة — فلا تعديل سعر، ولا إيقاف،
 * ولا سحب. **ولا بائع في المنصّة يستطيع تغيير سعره**، وهو أوّل ما
 * يفعله كل بائع في كل سوق.
 *
 * ═══ والحالة تُفرَّق: من أوقف؟ ═══
 *
 * `PAUSED` للبائع و`SUSPENDED` للأدمن. والزائر لا يرى الإعلان في
 * الحالين، فالفرق غير مرئيّ — **ولذلك بالضبط يُكتب في الحالة لا في
 * حقلٍ جانبيّ**: لو خُلطتا لرفع البائع عقوبةَ الأدمن بضغطة «أعِد
 * النشر».
 */

/** الحالات التي يملك البائع تغييرها — وما عداها ليس له. */
const SELLER_EDITABLE = ['DRAFT', 'PUBLISHED', 'PAUSED'] as const;

export type SellerListingFailure =
  | 'NOT_FOUND'
  | 'NOT_OWNER'
  | 'LOCKED_BY_ORDER'
  | 'NOT_EDITABLE'
  | 'NOTHING_TO_CHANGE'
  | 'PRICE_INVALID';

export type SellerListingResult =
  | { ok: true; status: string; askPrice: string }
  | { ok: false; reason: SellerListingFailure };

export type SellerListingEdit = {
  ref: string;
  sellerId: string;
  askPrice?: number;
  negotiable?: boolean;
  /**
   * حدّ القبول — **سرٌّ لا يخرج في أي استجابة**، والعروض دونه تُرفض
   * تلقائيًّا. و`null` تلغيه، فيصير كل عرضٍ إلى البائع.
   */
  minAcceptPrice?: number | null;
  /** وصف البائع — والفراغ يمحوه، فمن ندم على ما كتبه يستطيع سحبه. */
  description?: string;
  city?: string;
};

/**
 * الحدّان الأدنى والأعلى للسعر — **يمنعان الصفر والخطأ المطبعيّ**.
 *
 * سعرٌ بصفر يُظهر المركبة أعلى كل ترتيبٍ تصاعديّ ويوحي بأنها بلا قيمة،
 * وخانةٌ زائدة تجعلها بملايين فتختفي من كل ترشيح.
 */
export const PRICE_MIN = 1000;
export const PRICE_MAX = 10_000_000;

async function loadOwned(
  ref: string,
  sellerId: string,
): Promise<
  | { ok: true; row: { id: string; status: string; askPrice: Prisma.Decimal; activeOrders: number } }
  | { ok: false; reason: SellerListingFailure }
> {
  const row = await db.listing.findUnique({
    where: { ref },
    select: {
      id: true,
      status: true,
      askPrice: true,
      sellerId: true,
      _count: { select: { orders: { where: { status: 'ACTIVE' } } } },
    },
  });

  if (row === null) return { ok: false, reason: 'NOT_FOUND' };

  /**
   * **وغير المالك يرى `NOT_FOUND` لا `NOT_OWNER`.** أن يعرف غريبٌ أن
   * هذا المرجع قائمٌ ومملوكٌ لغيره معلومةٌ لا تلزمه — والمسار يردّ ٤٠٤.
   */
  if (row.sellerId !== sellerId) return { ok: false, reason: 'NOT_OWNER' };

  return {
    ok: true,
    row: {
      id: row.id,
      status: row.status,
      askPrice: row.askPrice,
      activeOrders: row._count.orders,
    },
  };
}

/**
 * تعديل ما يملكه البائع من إعلانه.
 *
 * **والمركبة نفسها ليست منه**: الماركة والطراز والفئة والسنة والعدّاد
 * ورقم الهيكل تصف شيئًا في الواقع لا رأيًا — وتغييرها بعد النشر يجعل
 * الإعلان مركبةً أخرى بتاريخ مشاهداتٍ ليس لها. من أخطأ فيها يسحب
 * إعلانه ويُنشئ غيره.
 *
 * **ولا تُعيد الدالّة `minAcceptPrice` ولا ما يُشتقّ منه.** هو سرّ
 * البائع الذي يُبنى عليه رفضُ العروض، وردُّه في استجابةٍ يفتح البابَ
 * الذي أُغلق بالبناء لا بالمراجعة.
 */
export async function updateOwnListing(
  input: SellerListingEdit,
): Promise<SellerListingResult> {
  const owned = await loadOwned(input.ref, input.sellerId);
  if (!owned.ok) return owned;

  /**
   * ═══ وإعلانٌ عليه طلبٌ قائم لا يُعدَّل سعرُه ═══
   *
   * المشتري دفع مقابل رقمٍ رآه، والطلب يحمل لقطته. وتغييرُ السعر تحته
   * لا يغيّر ما سيدفعه — **فهو لا يفيد البائع ويُربك كل من يقرأ
   * الشاشتين بعدها**: إعلانٌ بسعر، وطلبٌ عليه بسعرٍ آخر، ولا شيء يقول
   * أيّهما الصحيح.
   */
  if (owned.row.activeOrders > 0) return { ok: false, reason: 'LOCKED_BY_ORDER' };

  if (!(SELLER_EDITABLE as readonly string[]).includes(owned.row.status)) {
    return { ok: false, reason: 'NOT_EDITABLE' };
  }

  const data: Prisma.ListingUpdateInput = {};

  if (input.askPrice !== undefined) {
    if (
      !Number.isFinite(input.askPrice) ||
      input.askPrice < PRICE_MIN ||
      input.askPrice > PRICE_MAX
    ) {
      return { ok: false, reason: 'PRICE_INVALID' };
    }
    data.askPrice = new Prisma.Decimal(input.askPrice);
  }

  if (input.negotiable !== undefined) data.negotiable = input.negotiable;
  if (input.city !== undefined && input.city.trim() !== '') data.city = input.city.trim();

  if (input.description !== undefined) {
    const text = input.description.trim();
    // الفراغ يعني «امحُه» لا «لا تمسّه» — والغياب وحده هو الثاني
    data.description = text === '' ? null : text.slice(0, 4000);
  }

  if (input.minAcceptPrice !== undefined) {
    if (input.minAcceptPrice === null) {
      data.minAcceptPrice = null;
    } else {
      /**
       * **وحدُّ القبول لا يعلو السعر المعلن.** حدٌّ فوقه يرفض كل عرضٍ
       * تلقائيًّا بما فيه العرض بالسعر المطلوب نفسه — فيظنّ البائع أن
       * لا أحد يعرض عليه، والسبب رقمٌ كتبه هو ولا يراه أحد.
       */
      const ceiling = input.askPrice ?? Number(owned.row.askPrice);
      if (
        !Number.isFinite(input.minAcceptPrice) ||
        input.minAcceptPrice < PRICE_MIN ||
        input.minAcceptPrice > ceiling
      ) {
        return { ok: false, reason: 'PRICE_INVALID' };
      }
      data.minAcceptPrice = new Prisma.Decimal(input.minAcceptPrice);
    }
  }

  if (Object.keys(data).length === 0) return { ok: false, reason: 'NOTHING_TO_CHANGE' };

  /**
   * **ولا يُنتقى `status` هنا.** لم يتغيّر — وهو معنا في `owned` أصلًا.
   * وانتقاؤه يجعل بوابة «حالة الإعلان من مدخلها الوحيد» تُطلق على
   * قراءةٍ لا كتابة، فيتعوّد القارئ على تجاهلها.
   */
  const after = await db.listing.update({
    where: { id: owned.row.id },
    data,
    select: { askPrice: true },
  });

  return { ok: true, status: owned.row.status, askPrice: after.askPrice.toString() };
}

/**
 * إيقاف الإعلان أو إعادته.
 *
 * **ولا يرفع البائع إيقاف الأدمن**: `SELLER_EDITABLE` لا تضمّ
 * `SUSPENDED`، فمحاولةُ إعادة النشر منها تردّ `NOT_EDITABLE` — والحارس
 * في النطاق لا في الشاشة.
 *
 * **ولا يُوقَف إعلانٌ عليه طلب**: الإيقاف يخفيه عن الزائر، والمشتري
 * الذي دفع يبقى في طلبه ويقرأ صفحةً اختفت.
 */
export async function setOwnListingPaused(
  input: { ref: string; sellerId: string; paused: boolean },
): Promise<SellerListingResult> {
  const owned = await loadOwned(input.ref, input.sellerId);
  if (!owned.ok) return owned;

  if (owned.row.activeOrders > 0) return { ok: false, reason: 'LOCKED_BY_ORDER' };

  const from = owned.row.status;
  const allowed = input.paused ? from === 'PUBLISHED' : from === 'PAUSED';
  if (!allowed) return { ok: false, reason: 'NOT_EDITABLE' };

  /**
   * **والحالة تمرّ بمدخلها الوحيد** — `listing-state.ts` لا كتابةً هنا.
   * والقاعدة لها بوابة، وهي التي أمسكت هذا الموضع.
   */
  if (input.paused) {
    await pauseListing(db, owned.row.id);
  } else {
    await resumeListing(db, owned.row.id);
  }

  return {
    ok: true,
    status: input.paused ? 'PAUSED' : 'PUBLISHED',
    askPrice: owned.row.askPrice.toString(),
  };
}

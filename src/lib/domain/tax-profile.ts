import { db } from '@/lib/db';
import type { BuyerType, SellerType, TaxStatus } from '@/generated/prisma/enums';
import { toLatinDigits } from '@/lib/arabic';

/**
 * ═══ الوضع الضريبيّ — يُسأل مرّة عند أوّل إجراء ═══
 *
 * التسجيل بالجوال وحده. والسؤال يأتي حين يصير له أثر: أوّل نشر إعلان،
 * أو أوّل شراء. **والتذكير يسبق لحظة الحاجة** — لا يُكتشف عند «ادفع».
 *
 * و`taxStatus === null` تعني **لم يُسأل**، وهي حالٌ ثالثة لا تُختزل في
 * «فرد»: الاختزال يجعل التصنيف اختيارَنا لا اختيارَه، ونحن نُصدر عنه
 * فواتير تشهد بما اخترناه عنه.
 */

/** ١٥ رقمًا، تبدأ بـ٣ وتنتهي بـ٣ — نمط الهيئة. */
const VAT_LENGTH = 15;

/**
 * **الحقل يقبل كل صيغة لصق ويطبّعها.**
 *
 * الرقم يُنسخ من شهادة أو رسالة: بمسافات، بشرطات، بأرقام عربية-هندية،
 * وبسابقة `VAT`. ومن يمنع اللصق يظنّ أنه يمنع الخطأ وهو يصنعه — فالبديل
 * إدخالُ خمسة عشر رقمًا يدويًّا، وهو مصدر الخطأ الحقيقيّ.
 */
export function normalizeVatNumber(raw: string): string {
  return toLatinDigits(raw).replace(/\D/g, '');
}

export type VatCheck = { ok: true; value: string } | { ok: false; reason: VatFailure };
export type VatFailure = 'EMPTY' | 'LENGTH' | 'PATTERN';

/**
 * التحقّق **بعد** التطبيع لا قبله.
 *
 * ويُفصل سبب الرفض: «١٥ رقمًا» و«يبدأ بـ٣ وينتهي بـ٣» رسالتان مختلفتان،
 * ومن أدخل أربعة عشر رقمًا لا تنفعه رسالةٌ عن النمط.
 */
export function checkVatNumber(raw: string): VatCheck {
  const value = normalizeVatNumber(raw);
  if (value === '') return { ok: false, reason: 'EMPTY' };
  if (value.length !== VAT_LENGTH) return { ok: false, reason: 'LENGTH' };
  if (!value.startsWith('3') || !value.endsWith('3')) return { ok: false, reason: 'PATTERN' };
  return { ok: true, value };
}

export type TaxProfile = {
  status: TaxStatus | null;
  vatNumber: string | null;
  /** `true` ما دام لم يُسأل — والشاشة تفتح النافذة عليها. */
  needsAnswer: boolean;
};

export function taxProfileOf(user: {
  taxStatus: TaxStatus | null;
  vatNumber: string | null;
}): TaxProfile {
  return {
    status: user.taxStatus,
    vatNumber: user.vatNumber,
    needsAnswer: user.taxStatus === null,
  };
}

export type SaveResult = { ok: true; profile: TaxProfile } | { ok: false; reason: VatFailure };

/**
 * الحفظ **مرّة**، والتعديل من الإعدادات بعدها.
 *
 * و«مسجَّل بلا رقم» حالٌ لا تُخزَّن: الرقم هو ما يجعل التسجيل قابلًا
 * للتحقّق، وبدونه الوصف دعوى. فتُرفض ولا تُقبل ناقصة ثم تُستكمل لاحقًا
 * — إذ بين القبول والاستكمال فواتيرُ تصدر بوصفٍ لا سند له.
 */
export async function setTaxStatus(
  userId: string,
  input: { status: TaxStatus; vatNumber?: string },
  now: Date = new Date(),
): Promise<SaveResult> {
  if (input.status === 'INDIVIDUAL') {
    /**
     * العودة إلى «فرد» **تمحو الرقم**. وإبقاؤه يجعل صفًّا يقول «غير
     * مسجَّل» ويحمل رقم تسجيل — ويومًا ما يقرأ أحدهم الرقم لا الحالة.
     */
    const user = await db.user.update({
      where: { id: userId },
      data: { taxStatus: 'INDIVIDUAL', vatNumber: null, taxStatusSetAt: now },
    });
    return { ok: true, profile: taxProfileOf(user) };
  }

  const checked = checkVatNumber(input.vatNumber ?? '');
  if (!checked.ok) return { ok: false, reason: checked.reason };

  const user = await db.user.update({
    where: { id: userId },
    data: { taxStatus: 'VAT_REGISTERED', vatNumber: checked.value, taxStatusSetAt: now },
  });
  return { ok: true, profile: taxProfileOf(user) };
}

/**
 * ═══ **فئتان لا ثلاث** ═══
 *
 * والمُسنَد واحد: أمسجَّلٌ في القيمة المضافة أم لا. ولا فرق بين معرضٍ
 * مسجَّل وفردٍ مسجَّل — الأثر الضريبيّ واحد، وبناءُ فئةٍ ثالثة يُنشئ
 * فرعًا يجب أن يُتذكَّر في كل شاشة وكل حساب بلا مقابل.
 *
 * **وهذه الدالّة وحدها تقرّر**، وكل شاشةٍ تسألها ولا تعيد الاشتقاق.
 */
export function isVatRegistered(user: {
  taxStatus: TaxStatus | null;
  vatNumber: string | null;
}): boolean {
  // الرقم شرطٌ لا زينة: «مسجَّل بلا رقم» دعوى لا حالة
  return user.taxStatus === 'VAT_REGISTERED' && (user.vatNumber ?? '') !== '';
}

/**
 * ═══ مفتاح مطابقة القاعدة ═══
 *
 * وكان يُشتقّ من `dealerId` وحده، فيستحيل على فردٍ أن يكون مسجَّلًا.
 * صار يُشتقّ من `isVatRegistered` — و**استثناء الإعلان يتقدّم** لأنه
 * الأخصّ.
 *
 * و`DEALER_VAT` هنا تعني «مورّدٌ مسجَّل» لا «تاجر»: من هو المورّد يُقرأ
 * من `supplierName` و`supplierVatNo` في الفاتورة لا من هذا المفتاح.
 */
export function sellerTypeFor(
  seller: { taxStatus: TaxStatus | null; vatNumber: string | null; dealerId: string | null },
  listing: { taxableSupply: boolean | null },
): SellerType {
  const isDealer = seller.dealerId !== null;

  /**
   * الاستثناء يُصرَّح به: `true` «هذه المركبة خاضعة»، و`false` «غير
   * خاضعة»، و`null` وحدها تفويض. ولا يُقلَب `false` إلى خاضع بحجّة أن
   * البائع مسجَّل — فهو من قال إنها ليست من نشاطه.
   */
  if (listing.taxableSupply === true) return 'DEALER_VAT';
  if (listing.taxableSupply === false) return isDealer ? 'DEALER_NO_VAT' : 'INDIVIDUAL';

  if (isVatRegistered(seller)) return 'DEALER_VAT';
  return isDealer ? 'DEALER_NO_VAT' : 'INDIVIDUAL';
}

export function buyerTypeFor(buyer: {
  taxStatus: TaxStatus | null;
  vatNumber: string | null;
  dealerId: string | null;
}): BuyerType {
  // المشتري المسجَّل منشأة — وفاتورته تحمل رقمه ليسترد مدخلاته
  if (isVatRegistered(buyer)) return buyer.dealerId === null ? 'COMPANY' : 'DEALER';
  return buyer.dealerId === null ? 'INDIVIDUAL' : 'DEALER';
}

/**
 * أيحمل هذا الإعلان ضريبةً على المركبة؟
 *
 * وهو ما يفصل «٥٠٬٠٠٠ سعر نهائي» عن «٥٧٬٥٠٠ شامل الضريبة» في الواجهة.
 */
export function vehicleIsTaxable(sellerType: SellerType): boolean {
  return sellerType === 'DEALER_VAT' || sellerType === 'COMPANY';
}

/**
 * ═══ هامش الربح — **التسجيل شرطٌ فيه** ═══
 *
 * والاستحقاق يتبع الرقم الضريبيّ لا نوع الحساب: فردٌ مسجَّل قد يستحقّه،
 * ومعرضٌ غير مسجَّل لا يستحقّه.
 *
 * **والشرطان يُفحصان معًا هنا** لا في المستدعي: راية اعتمادٍ على حسابٍ
 * غير مسجَّل لا معنى لها، وتطبيقُها يحتسب الضريبة على الهامش وحده لمن
 * لا يورّد بضريبة أصلًا — نقصٌ في التحصيل بغطاء إعدادٍ قديم.
 *
 * ويُقرأ المعرض احتياطًا لاعتماداتٍ سبقت النقل.
 */
export function marginApprovedFor(seller: {
  taxStatus: TaxStatus | null;
  vatNumber: string | null;
  marginSchemeApproved?: boolean;
  dealer?: { marginSchemeApproved: boolean } | null;
}): boolean {
  if (!isVatRegistered(seller)) return false;
  return seller.marginSchemeApproved === true || seller.dealer?.marginSchemeApproved === true;
}

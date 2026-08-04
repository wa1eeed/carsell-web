import { Prisma } from '@/generated/prisma/client';
import type { FeeBearer } from '@/generated/prisma/enums';
import type { db } from '@/lib/db';
import { DEFAULT_VAT_PCT } from './tax';
import { effectiveAdminFee, ourVat, processingFeeFor } from './fees';

/**
 * ═══ مبالغ الطلب — **قاعدةٌ واحدة لكل مصادر الطلب** ═══
 *
 * الطلب يُنشأ من ثلاثة مسارات: بيعٌ مباشر، وقبولُ عرض، ورسوّ مزاد.
 * وحسابُ العمولة والرسوم والضريبة واحدٌ فيها جميعًا — فنسخُه في كل
 * مسار يُنتج ثلاث قواعد تتباعد أوّل تغيير، والفرق يظهر في فاتورة.
 *
 * وكان محسوبًا داخل `acceptOffer` وحده. أُخرج هنا حين احتاجه البيع
 * المباشر، **قبل** أن يُنسخ لا بعده.
 */

export type OrderAmounts = {
  agreedPrice: Prisma.Decimal;
  commissionPct: Prisma.Decimal;
  commissionAmount: Prisma.Decimal;
  /** حكوميّ يُمرَّر كما هو — لا ضريبة لنا فيه */
  transferFee: Prisma.Decimal;
  /** رسمنا الإداريّ — سطرٌ مستقلّ دائمًا */
  transferAdminFee: Prisma.Decimal;
  processingFee: Prisma.Decimal;
  processingFeeBearer: FeeBearer;
  /** ضريبة توريداتنا وحدها */
  vatAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
};

type Reader = Pick<typeof db, 'platformSetting' | 'commissionRule'>;

/**
 * يقبل `tx` أو `db` — فيُحسب داخل معاملة الإنشاء لا قبلها.
 *
 * والقراءة داخل المعاملة تجعل اللقطة متّسقة: قاعدة عمولةٍ تتغيّر بين
 * القراءة والكتابة تُنتج طلبًا بنسبةٍ لم تكن سارية في أيٍّ من اللحظتين.
 */
export async function computeOrderAmounts(
  reader: Reader,
  price: number,
  now: Date = new Date(),
): Promise<OrderAmounts> {
  const [platform, commissionRule] = await Promise.all([
    reader.platformSetting.findUnique({ where: { id: 'default' } }),
    reader.commissionRule.findFirst({
      where: { scope: 'global', activeFrom: { lte: now } },
      orderBy: { activeFrom: 'desc' },
    }),
  ]);

  const commissionPct = commissionRule === null ? 0 : Number(commissionRule.pct);
  const commissionAmount =
    commissionRule === null
      ? 0
      : Math.min(
          Math.max(
            (price * commissionPct) / 100 + Number(commissionRule.fixedFee),
            Number(commissionRule.minFee ?? 0),
          ),
          Number(commissionRule.maxFee ?? Number.MAX_SAFE_INTEGER),
        );

  /**
   * رسم النقل **حكوميّ يُمرَّر كما هو** — صرفٌ نيابةً عن العميل. ورسمنا
   * الإداريّ سطرٌ ثانٍ مستقلّ، لأن دمجهما يُسقط وصف الصرف عن المبلغ كلّه
   * فتُستحقّ الضريبة على كامله.
   */
  const transferFee = Number(platform?.transferFee ?? 0);
  const transferAdminFee = effectiveAdminFee({
    adminFeeEnabled: platform?.transferAdminFeeEnabled ?? false,
    adminFee: platform?.transferAdminFee ?? 0,
  });

  /**
   * رسوم المعالجة **تُضاف للمشتري أو تُخصم من البائع، لا كليهما**.
   * فما يدخل الإجمالي صفرٌ حين يتحمّلها البائع، وخصمُه يقع في كشف
   * التسوية من مستحقّه.
   */
  const processingFee = processingFeeFor(
    platform ?? {
      processingFeeEnabled: false,
      processingFeeBearer: 'SELLER',
      processingFeePct: 0,
      processingFeeFixed: 0,
    },
    price,
  );
  const processingFeeBearer = platform?.processingFeeBearer ?? 'SELLER';
  const buyerShare = processingFeeBearer === 'BUYER' ? Number(processingFee) : 0;

  const total = price + commissionAmount + transferFee + Number(transferAdminFee) + buyerShare;

  /**
   * الضريبة على **توريداتنا وحدها** — العمولة والرسوم الإدارية ورسوم
   * المعالجة. ولا تدخلها قيمة المركبة (مورّدها البائع) ولا الرسم
   * الحكوميّ (لسنا مورّده).
   */
  const vatAmount = ourVat(
    { commissionAmount, transferAdminFee, processingFee },
    Number(platform?.vatPct ?? DEFAULT_VAT_PCT),
  );

  return {
    agreedPrice: new Prisma.Decimal(price),
    commissionPct: new Prisma.Decimal(commissionPct),
    commissionAmount: new Prisma.Decimal(commissionAmount),
    transferFee: new Prisma.Decimal(transferFee),
    transferAdminFee,
    processingFee,
    processingFeeBearer,
    vatAmount,
    totalAmount: new Prisma.Decimal(total),
  };
}

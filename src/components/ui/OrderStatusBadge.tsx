import { useTranslations } from 'next-intl';
import { Badge, type BadgeTone } from './Badge';

/**
 * ═══ حالة الطلب في وسمٍ واحد ═══
 *
 * **والإلغاء حالةٌ لا مرحلة** (قرار المصمّم ١٧، ٢٠٢٦-٠٨-٠٢): الطلب
 * يبقى عند المرحلة التي مات فيها، فيُقرأ «أُلغي عند الدفع» لا «أُلغي».
 *
 * وكانت الشاشات تعرض وسمَ المرحلة وحده بلون `accent` — فطلبٌ ملغى
 * يحمل وسمًا أخضر يقول «دفع». ثم أُضيف وسمُ حالةٍ بجواره، **فصار
 * وسمان متجاوران يتناقضان**: «ملغى» و«دفع» في سطرٍ واحد. والقرار
 * يحسمها: وسمٌ واحد يجمعهما في قراءةٍ واحدة.
 *
 * ═══ واللون يقول ما يُفعل ═══
 *
 * `accent` للمكتمل — نجاحٌ انتهى. و`warn` لما يحتاج انتباهًا:
 * المتوقّف والمتنازَع عليه. و`neutral` للملغى: بابٌ أُغلق، لا عطلٌ
 * ولا خطأ، فلا يُصبغ أحمر. و`danger` محجوز للفشل والحذف وحدهما.
 */
export function OrderStatusBadge({
  status,
  stage,
  size,
}: {
  status: string;
  stage: string;
  size?: 'sm';
}) {
  const te = useTranslations('enums');

  /** الحيُّ يُقرأ بمرحلته — هي ما ينتظره صاحبه. */
  if (status === 'ACTIVE') {
    return (
      <Badge tone={stage === 'DONE' ? 'accent' : 'neutral'} size={size}>
        {te(`orderStage.${stage}`)}
      </Badge>
    );
  }

  /** والمكتمل لا يُقال «عند الإتمام» — تمامُه هو مرحلتُه. */
  if (status === 'COMPLETED') {
    return (
      <Badge tone="accent" size={size}>
        {te('orderStatus.COMPLETED')}
      </Badge>
    );
  }

  const TONE: Record<string, BadgeTone> = {
    CANCELLED: 'neutral',
    STALLED: 'warn',
    DISPUTED: 'warn',
  };

  const tone = TONE[status];
  /**
   * حالةٌ لا نعرفها تُقرأ باسمها بلا تلوين — **ولا تُخفى**. وإخفاء ما
   * لم يُتوقَّع يجعل الصفّ يقول «دفع» عن طلبٍ في حالٍ سادسة تُضاف غدًا.
   */
  if (tone === undefined) {
    return (
      <Badge tone="neutral" size={size}>
        {te(`orderStatus.${status}`)}
      </Badge>
    );
  }

  /*
    **والعبارة مكتوبة لا مُلحَقة.** «نقل ملكية» + ال تُنتج «النقل
    ملكية»، فالصيغ الستّ في `orderStoppedAt` صريحةً في الحزمة.
  */
  return (
    <Badge tone={tone} size={size}>
      {te(`orderStopped.${status}`)} {te(`orderStoppedAt.${stage}`)}
    </Badge>
  );
}

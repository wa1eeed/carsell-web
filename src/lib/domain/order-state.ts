/**
 * ═══ محكّات حالة الطلب — بلا تبعيّات ═══
 *
 * **موضعُها ملفٌّ مستقلّ لا `orders.ts`.** فـ`orders.ts` يستورد
 * `payments.ts` استيرادًا مؤجَّلًا تهرّبًا من حلقة، واستيرادٌ ساكنٌ
 * معاكس يعيدها. والمحكُّ دالّةٌ محضة لا تلمس قاعدةً، فملفُّها بلا
 * تبعيّةٍ واحدة يقرؤه الطرفان والشاشة.
 */

/**
 * ═══ الطلب الحيّ ═══
 *
 * **والمرحلة لا تكفي.** الإلغاء حالةٌ لا مرحلة (قرار المصمّم ١٧):
 * الطلب يبقى عند المرحلة التي مات فيها، فطلبٌ ملغى في `PAYMENT`
 * **مرحلتُه `PAYMENT` إلى الأبد** — فمن قرأ المرحلة وحدها رأى طلبًا
 * ينتظر الدفع، وعرض عليه زرَّ دفعٍ يعمل.
 *
 * والمحكُّ واحدٌ يقرؤه الحارس والشاشة: شرطٌ تفرضه الشاشة ولا يفرضه
 * الخادم اقتراحٌ لا حارس.
 */
export function isLiveOrder(status: string): boolean {
  return status === 'ACTIVE';
}

/**
 * ═══ ما ينتظر صاحبه فعلًا ═══
 *
 * يُقرأ في البنر وفي وميض التبويب — **وهما كانا يقرآن المرحلة وحدها**،
 * فبنرٌ أخضر يقول «طلبٌ ينتظر الدفع» عن طلبٍ أُلغي.
 */
export function orderNeedsBuyer(status: string, stage: string): boolean {
  return isLiveOrder(status) && (stage === 'PAYMENT' || stage === 'TRANSFER');
}

/**
 * ═══ المغلَق — لا بابَ منه ═══
 *
 * **وهو أضيق من «غير الحيّ»**: `STALLED` متوقّفٌ ويُستأنف، و`DISPUTED`
 * مجمَّدٌ يُحسم — فلهما مسارات. أمّا الملغى والمكتمل فلا شيء منهما
 * يُستأنف.
 *
 * والحدُّ هو نفسه الذي يفرضه `openDispute` (`ORDER_CLOSED`) —
 * **فيُكتب مرّة** وتقرؤه الشاشة والنطاق. ولو كتبتُ `!isLiveOrder` في
 * الشاشة لأخفيتُ عن المتوقّف بابًا يفتحه له الخادم.
 */
export function isClosedOrder(status: string): boolean {
  return status === 'CANCELLED' || status === 'COMPLETED';
}

/**
 * ═══ تجميع «طلباتي» الثلاثة ═══
 *
 * قيد الإجراء · المكتملة · الملغاة. **و`STALLED` و`DISPUTED` قيد
 * إجراء**: لا هما مكتملان ولا ملغيان، ولهما مسارٌ يُستأنف — فإخراجُهما
 * من القائمة الأولى يُخفي عن صاحبهما ما يحتاج متابعته.
 *
 * والتجميع هنا لا في الشاشتين: نسختان تتباعدان أوّل حالةٍ تُضاف إلى
 * `OrderStatus`، فيقول عدّادُ التبويب غير ما تعرضه القائمة تحته.
 */
export const ORDER_GROUPS = ['live', 'done', 'cancelled'] as const;

export type OrderGroup = (typeof ORDER_GROUPS)[number];

export function orderGroup(status: string): OrderGroup {
  if (status === 'COMPLETED') return 'done';
  if (status === 'CANCELLED') return 'cancelled';
  return 'live';
}

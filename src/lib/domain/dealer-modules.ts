import { resolveEntitlements, type Entitlements } from './entitlements';
import type { DealerActor } from './dealer-auth';

/**
 * ═══ موديولزُ لوحة المعرض ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٦: «كلها تكون على شكل موديولز يمكن للسوبر ادمن
 * اضافتها حسب باقات المعارض».
 *
 * **والسؤالُ عن المفتاح لا عن الباقة** — القاعدةُ الذهبية في
 * `entitlements.ts`: الشاشةُ تسأل `dealer_pos`، ولا تسأل «ما باقتُه؟»
 * ولا «أهو مالك؟». فباقةٌ تُضاف غدًا لا تحتاج سطرًا في الشيفرة.
 *
 * **وحارسٌ في الشاشة ليس حارسًا**: إخفاءُ بندٍ من الشريط اقتراح، ومن
 * كتب العنوانَ بيده يصل الشاشة. فكلُّ شاشةِ موديولٍ تسأل هنا أيضًا.
 */

/** المفاتيحُ التي يقرؤها الشريطُ والشاشات — بلا تعدادٍ في المخطّط. */
export const DEALER_MODULE = {
  branches: 'dealer_branches',
  customers: 'dealer_customers',
  expenses: 'dealer_expenses',
  pos: 'dealer_pos',
  installments: 'dealer_installments',
  landing: 'dealer_landing',
} as const;

export type DealerModule = (typeof DEALER_MODULE)[keyof typeof DEALER_MODULE];

/**
 * **والمفتاحُ الغائبُ مسموح** — كما في محرّك الاستحقاقات: خاصّيةٌ لم
 * تُعرَّف لا تمنع أحدًا. فبيئةٌ لم يصلها ترحيلُ المفاتيح تعمل كما كانت،
 * ولا يختفي قسمٌ لأنّ صفًّا مرجعيًّا تأخّر.
 */
export function hasModule(grants: Entitlements, key: string | undefined): boolean {
  if (key === undefined) return true;
  const value = grants[key];
  return value === undefined ? true : value === true;
}

export async function dealerGrants(
  actor: Pick<DealerActor, 'userId' | 'dealerId'>,
  now: Date = new Date(),
): Promise<Entitlements> {
  return resolveEntitlements({ userId: actor.userId, dealerId: actor.dealerId }, now);
}

/** يُجيب بسؤالٍ واحد — وتستعمله الشاشةُ حين لا تحتاج بقيّةَ المنح. */
export async function dealerHasModule(
  actor: Pick<DealerActor, 'userId' | 'dealerId'>,
  key: DealerModule,
  now: Date = new Date(),
): Promise<boolean> {
  return hasModule(await dealerGrants(actor, now), key);
}

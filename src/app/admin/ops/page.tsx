import { redirect } from 'next/navigation';

/**
 * `/admin/ops` — **تابٌ لا شاشة**.
 *
 * التصميم يضع «تشغيلية» تابًا داخل لوحة القيادة (A2)، وكانت هنا شاشةً
 * مستقلّة في الشريط الجانبي. والمسار يبقى محوِّلًا لا يُحذف: روابطُه
 * منسوخةٌ في محادثاتٍ وإشاراتٍ مرجعية، وحذفُه يجعلها ٤٠٤ بلا سبب.
 */
export default function OpsRedirect(): never {
  redirect('/admin?tab=ops');
}

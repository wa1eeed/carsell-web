import { redirect } from 'next/navigation';

/**
 * `/admin/finance` — **تابٌ لا شاشة** (A3 في التصميم).
 * والمسار يبقى محوِّلًا: الروابط المنسوخة لا تُترك ٤٠٤.
 */
export default function FinanceRedirect(): never {
  redirect('/admin?tab=finance');
}

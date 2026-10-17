import { redirect } from 'next/navigation';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { ProviderBar } from '../ProviderBar';
import { ChangePassword } from './ChangePassword';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'حسابي' };

/**
 * حسابُ المزوّد — وكلمتُه.
 *
 * **ولا شيء غيرها هنا بعد.** اسمُه وبريدُه يضبطهما من فتح حسابه،
 * وصفحةٌ تعرض حقولًا لا تُحفظ أسوأ من صفحةٍ قصيرة.
 */
export default async function ProviderAccountPage() {
  const user = await currentProviderUser();
  if (user === null) redirect('/provider/login');

  return (
    <>
      <ProviderBar name={user.name} />

      <main className="mx-auto w-full max-w-4xl p-6">
        <h1 className="mb-1.5 text-2xl font-bold tracking-tight">حسابي</h1>
        <p className="mb-7 text-sm opacity-70">
          <span dir="ltr" className="bidi-ltr font-num">{user.email}</span>
        </p>

        <ChangePassword mustChange={user.mustChangePassword} />
      </main>
    </>
  );
}

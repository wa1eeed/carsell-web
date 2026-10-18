import { redirect } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { ProviderLoginForm } from './ProviderLoginForm';

export const dynamic = 'force-dynamic';

export default async function ProviderLoginPage() {
  if ((await currentProviderUser()) !== null) redirect('/provider');

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2.5">
          <Logo />
          <p className="text-2xs tracking-[0.18em] opacity-65">لوحة المزودين</p>
        </div>
        <ProviderLoginForm />
        <p className="mt-6 text-center text-3xs leading-loose opacity-70">
          الحساب تنشئه إدارة المنصة. وإن نسيت كلمة المرور راجعها.
        </p>
      </div>
    </main>
  );
}

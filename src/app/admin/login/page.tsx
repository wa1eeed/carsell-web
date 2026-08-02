import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/auth/admin-session';
import { AdminLoginForm } from './AdminLoginForm';
import { APP_ENV } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * دخول الأدمن — **بلا بطاقة تصميم**، مبنيّ على نظام التوكنات.
 * الانحراف مسجَّل في docs/frontend/components.md.
 *
 * لا «تذكّرني» ولا «نسيت كلمة المرور» ولا دخول اجتماعي:
 * الحساب ينشئه SUPER_ADMIN وإعادة التعيين منه وحده.
 */
export default async function AdminLoginPage() {
  if ((await currentAdmin()) !== null) redirect('/admin');

  return (
    <main className="flex min-h-screen flex-col bg-ink">
      {APP_ENV === 'staging' ? (
        <div className="flex items-center justify-center gap-2 bg-warn px-5 py-2 text-2xs font-bold text-ink">
          <span className="size-1.5 rounded-full bg-ink" aria-hidden />
          بيئة تجريبية — APP_ENV=staging
        </div>
      ) : null}

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-100 rounded-xl bg-bg p-10 text-ink">
          <header className="mb-8 text-center">
            <p className="font-body-en text-3xl font-extrabold tracking-tight">
              carsell<span className="text-accent">.one</span>
            </p>
            <p className="mt-2 text-3xs font-semibold tracking-[0.12em] opacity-55">
              ADMIN CONSOLE
            </p>
          </header>
          <AdminLoginForm />
        </div>
      </div>
    </main>
  );
}

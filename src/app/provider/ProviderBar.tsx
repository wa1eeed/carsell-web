import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { SignOut } from '@/components/ui/SignOut';

/**
 * شريطُ اللوحة — اسمٌ وخروج.
 *
 * **والخروج موجودٌ من أوّل يوم**: جهاز مركز الفحص يُشارَك بين موظّفين،
 * ومن لا يستطيع الخروج يترك جلسته لمن بعده. (وبُني في الموقع واللوحة
 * بعد أن قِيس غيابُهما — فلا يُعاد الخطأ ثالثةً.)
 */
export function ProviderBar({ name }: { name: string }) {
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-line bg-surface px-6 py-4">
      <Logo />
      <span className="text-2xs tracking-[0.18em] opacity-65">لوحة المزوّدين</span>
      <span className="flex-1" />
      {/*
        **واسمُه بابٌ لا نصّ** — كان يُعرض ولا يُفتح، ولا طريق إلى
        حسابه ولا إلى كلمته. وهي الصفحةُ التي يُقال له في كل دخولٍ
        «غيّر كلمتك» ولا يجدها.
      */}
      <Link
        href="/provider/account"
        className="bidi-isolate text-sm font-bold underline-offset-4 hover:underline"
      >
        {name}
      </Link>
      <SignOut path="/api/v1/provider/auth/logout" next="/provider/login" label="خروج" />
    </header>
  );
}

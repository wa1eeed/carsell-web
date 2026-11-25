'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import type { EditableProfile } from '@/lib/domain/dealer-profile';

/**
 * **والنبذةُ تُعدّ حروفَها وهي تُكتب.** حدٌّ يُعرف عند الحفظ يُضيّع ما
 * كُتب — ومن بلغه لا يعرف كم يحذف.
 */
const ABOUT_MAX = 600;

export function DealerProfileForm({ profile }: { profile: EditableProfile }) {
  const router = useRouter();
  const [nameAr, setNameAr] = useState(profile.nameAr);
  const [nameEn, setNameEn] = useState(profile.nameEn);
  const [aboutAr, setAboutAr] = useState(profile.aboutAr ?? '');
  const [address, setAddress] = useState(profile.address ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/dealer/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nameAr, nameEn, aboutAr, address, phone }),
      }).catch(() => null);

      const data = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(data?.error?.messageAr ?? 'تعذر الحفظ.');
        return;
      }
      setToast('حفظ الملف — ويظهر في صفحة معرضك وبطاقات إعلاناتك.');
      router.refresh();
    });
  };

  const field = 'w-full rounded-lg border border-line bg-bg px-3.5 py-2.5 text-2xs';

  return (
    <>
      {toast === null ? null : <Toast title={toast} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nameAr" className="mb-2 block text-3xs font-bold opacity-70">
            اسم المعرض (عربي)
          </label>
          <input id="nameAr" value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="nameEn" className="mb-2 block text-3xs font-bold opacity-70">
            الاسم (إنجليزي)
          </label>
          {/*
            **و`dir="ltr"` على كل حقلٍ يُنسخ من مصدرٍ لاتينيّ** — قاعدةٌ
            مسجَّلة: يُقارَن خانةً بخانة.
          */}
          <input
            id="nameEn"
            dir="ltr"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="phone" className="mb-2 block text-3xs font-bold opacity-70">
            هاتف المعرض
          </label>
          <input
            id="phone"
            dir="ltr"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="address" className="mb-2 block text-3xs font-bold opacity-70">
            العنوان
          </label>
          <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} className={field} />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="aboutAr" className="mb-2 block text-3xs font-bold opacity-70">
          نبذة
        </label>
        <textarea
          id="aboutAr"
          rows={4}
          maxLength={ABOUT_MAX}
          value={aboutAr}
          onChange={(e) => setAboutAr(e.target.value)}
          className={`${field} leading-loose`}
        />
        <p className="mt-1.5 text-3xs opacity-70">
          <span dir="ltr" className="font-num">
            {aboutAr.length}/{ABOUT_MAX}
          </span>
        </p>
      </div>

      <Button className="mt-5" disabled={pending} onClick={save}>
        {pending ? 'يحفظ…' : 'احفظ'}
      </Button>
    </>
  );
}

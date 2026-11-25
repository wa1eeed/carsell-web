import { notFound, redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerProfile } from '@/lib/domain/dealer-profile';
import { DealerShell } from '@/components/dealer/DealerShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { DealerProfileForm } from './ProfileForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'الملف العام — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D10` — الملف العام ═══
 *
 * **وما يُعرض غيرُ ما يُحرَّر.** السجلُّ التجاريّ والرقمُ الضريبيّ
 * وشارةُ التوثيق والتقييمُ **تُقرأ ولا تُكتب من هنا** — وتعليقُ
 * الترميز يقولها: «شارة تاجر موثّق تأتي من الأدمن بعد التحقّق من
 * السجل التجاري — لا تُمنح من هنا. متوسط التقييم وأيام البيع محسوبان
 * آليًا ولا يمكن تعديلهما».
 *
 * **والرقمُ الضريبيّ أخطرُها**: تُصدَر به فواتيرُ ضريبية، فتعديلُه من
 * هنا يُخرج وثيقةً برقمٍ لم يتحقّق منه أحد.
 */
export default async function DealerPublicProfile() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (actor.role !== 'OWNER' && actor.role !== 'MANAGER') redirect('/dealer');

  const profile = await dealerProfile(actor.dealerId);
  if (profile === null) notFound();

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/profile"
      title="الملف العام"
      subtitle="يظهر في صفحة معرضك وبطاقات إعلاناتك"
      actions={
        /** **والمعاينةُ صفحتُه الحقيقية** — لا نسخةٌ مرسومة تتباعد عنها. */
        <LinkButton href={`/ar/dealers/${profile.readOnly.slug}`} variant="outline" size="sm">
          عرضه كمشتري
        </LinkButton>
      }
    >
      <section className="mb-6 rounded-xl border border-line p-5">
        <h2 className="mb-4 text-3xs font-bold tracking-wide opacity-70">ما تحرره</h2>
        <DealerProfileForm profile={profile.editable} />
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-4 text-3xs font-bold tracking-wide opacity-70">
          ما يأتي من المنصة — ولا يعدل من هنا
        </h2>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-3 border-b border-line-2 py-2.5">
            <dt className="text-2xs opacity-70">المدينة</dt>
            <dd className="text-2xs font-semibold">{profile.readOnly.city}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-line-2 py-2.5">
            <dt className="text-2xs opacity-70">السجل التجاري</dt>
            <dd dir="ltr" className="font-num text-2xs font-semibold">
              {profile.readOnly.crNumber ?? '—'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-line-2 py-2.5">
            <dt className="text-2xs opacity-70">الرقم الضريبي</dt>
            <dd dir="ltr" className="font-num text-2xs font-semibold">
              {profile.readOnly.vatNumber ?? '—'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-line-2 py-2.5">
            <dt className="text-2xs opacity-70">شارة التوثيق</dt>
            <dd>
              {profile.readOnly.verified ? (
                <Badge tone="accent">تاجر موثق</Badge>
              ) : (
                <Badge tone="warn">قيد التوثيق</Badge>
              )}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-2xs opacity-70">التقييم</dt>
            <dd className="text-2xs font-semibold">
              {/*
                **وتقييمٌ بلا مقيّمين ليس صفرًا**: «٠٫٠٠» تحت التقييم
                تُقرأ حكمًا، و«لا تقييمات بعد» تقول الحال.
              */}
              {profile.readOnly.ratingAvg === null || profile.readOnly.ratingCount === 0 ? (
                <span className="opacity-70">لا تقييمات بعد</span>
              ) : (
                <>
                  <span className="font-num">{profile.readOnly.ratingAvg}</span>
                  <span className="ms-2 font-normal opacity-70">
                    من <ArabicNumber value={profile.readOnly.ratingCount} />
                  </span>
                </>
              )}
            </dd>
          </div>
        </dl>

        <p className="mt-4 rounded-lg border border-line p-4 text-2xs leading-loose opacity-75">
          شارة «تاجر موثق» تأتي من فريق المنصة بعد التحقق من سجلك التجاري. والرقم الضريبي
          تصدر به فواتيرك، فتعديله يمر بالمنصة — راسلنا إن تغير.
        </p>
      </section>
    </DealerShell>
  );
}

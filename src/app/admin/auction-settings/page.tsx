import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { auctionSettings } from '@/lib/domain/admin-auction-settings';
import { AuctionSettingsForm } from './AuctionSettingsForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إعدادات المزادات' };

/**
 * A32 — إعدادات المزادات.
 *
 * **تُنسَخ لقطةً في كل مزاد وقت إنشائه** — فمزايدٌ بدأ على قاعدة لا
 * تتغيّر عليه القاعدة في منتصف المزاد. والتعديل يسري على الجديد وحده.
 */
export default async function AdminAuctionSettingsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const settings = await auctionSettings();

  return (
    <AdminShell title="إعدادات المزادات" activeHref="/admin/auction-settings" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        القواعد النافذة على كل مزاد جديد. والتوقيت من{' '}
        <Link href="/admin/deadlines" className="font-bold underline underline-offset-2">
          المهل الزمنية
        </Link>
        ، والباقي هنا.
      </p>

      <AuctionSettingsForm
        settings={settings}
        canEdit={canWrite(admin.role, 'finance.view')}
      />
    </AdminShell>
  );
}

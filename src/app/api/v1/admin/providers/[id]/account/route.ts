import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { openProviderAccount, saveAccountFile } from '@/lib/domain/provider-account';

export const runtime = 'nodejs';

const File = z.object({
  kind: z.enum(['FREELANCER', 'ESTABLISHMENT', 'COMPANY', 'GOVERNMENT', 'CHARITY']),
  slug: z.string().max(40),
  website: z.string().max(200),
  adminEmail: z.string().max(160),
  owners: z.number().int().min(1).max(50),
  signatory: z.enum(['OWNER', 'COMMERCIAL_CONTRACT', 'POWER_OF_ATTORNEY']),
  signatoryCount: z.number().int().min(1).max(50).nullable(),
  licence: z.boolean(),
});

/**
 * `PUT` — ملفُّ التسجيل. و`POST` — فتحُ الحساب لدى البوّابة.
 *
 * **والفعلان منفصلان**: الملفُّ يُجمَع من الشريك على مهل ويُصحَّح، والفتح
 * **لا رجعةَ فيه** — حسابٌ لدى جهةٍ منظِّمة بشروطٍ تجاريّة ودعوةٌ
 * تُرسَل إلى بريد. ودمجُهما يجعل تصحيح موقعٍ إلكترونيّ يفتح حسابًا.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsed = File.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ slug: 'INVALID' }), 422);

  const result = await saveAccountFile(guard.admin, id, parsed.data, guard.ip);
  if (!result.ok) {
    return result.reason === 'NOT_FOUND'
      ? fail(ERRORS.NOT_FOUND, 404)
      : fail(ERRORS.VALIDATION({ file: result.reason }), 422);
  }

  return ok({ saved: true });
}

/**
 * **والرمزُ يُعاد كما هو** — والصياغة في الشاشة. فـ`NO_FEES` تعني
 * «اضبط المصفوفة» و`NOT_CONFIGURED` تعني «لا مفتاح للبوّابة»، وهما
 * إجراءان مختلفان لمن يقرأ.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const result = await openProviderAccount(guard.admin, id, guard.ip);
  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ account: result.reason }), 422);
  }

  return ok({
    accountRef: result.state.accountRef,
    payoutRef: result.state.payoutRef,
    status: result.state.status,
    requiredDocuments: result.state.requiredDocuments,
  });
}

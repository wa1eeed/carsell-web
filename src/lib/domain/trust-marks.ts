import { db } from '@/lib/db';
import type { TrustMarkKind } from '@/generated/prisma/enums';

/**
 * ═══ علاماتُ الموثوقية — دعوى لا زينة ═══
 *
 * طلب المالك ٢٠٢٦-١٠-١٨: شعاراتُ الجهات ووسائلُ الدفع في التذييل
 * «بذكاء واحترافيه».
 *
 * **ووسمُ جهةٍ نظامية دعوى**: «مسجَّلون للضريبة»، «سجلُّنا التجاريّ
 * قائم». والمنصّاتُ التي تُحسن هذا تطبع الرقمَ تحت الوسم وتربطه
 * بصفحة التحقّق — وبه وحده يُساوي الوسمُ شيئًا، وبدونه صورةٌ لا
 * تُراجَع. فالقراءةُ تُخرج الرقمَ والرابط، والشاشةُ تعرض «موثَّق»
 * لمن له رقم و«مسجَّل» لمن لم يُملأ بعد.
 */

export type TrustMarkView = {
  key: string;
  nameAr: string;
  nameEn: string;
  logoPath: string;
  registrationNo: string | null;
  verifyUrl: string | null;
};

/**
 * علاماتُ صنفٍ واحد، مرتَّبة — **والمطفأةُ لا تخرج**.
 *
 * فالإطفاءُ هو كيف يسحب المالكُ دعوى لم تعد قائمة: شهادةٌ انقضت أو
 * وسيلةُ دفعٍ أُوقفت. وعلامةٌ تبقى معروضةً بعد انقضائها أسوأ من ألّا
 * تكون — لأنها تُقرأ ساريةً.
 */
export async function trustMarks(kind: TrustMarkKind): Promise<TrustMarkView[]> {
  const rows = await db.trustMark.findMany({
    where: { kind, active: true },
    orderBy: { sort: 'asc' },
    select: {
      key: true,
      nameAr: true,
      nameEn: true,
      logoPath: true,
      registrationNo: true,
      verifyUrl: true,
    },
  });
  return rows;
}

/**
 * ═══ وما يُعرَض يُملَك — ولم يكن له بابٌ يُملأ منه ═══
 *
 * الوثيقةُ تقول إنّ الرقمَ ورابطَ التحقّق «يُضبطان من اللوحة»،
 * **ولا شاشةَ ولا مسارَ يكتبهما**: `TrustMark` بلا كاتبٍ إطلاقًا.
 * فالتذييل يعرض اليوم أربعَ جهاتٍ نظامية **بلا رقمٍ واحد** — ووسمٌ
 * بلا رقمه صورةٌ لا تُراجَع، ووسمٌ لجهةٍ لا نملك تسجيلَها دعوى
 * كاذبة على الطرف الآخر منها جهةٌ رقابية.
 *
 * و«قبل أن تفرض شرطًا، افتح الباب الذي يُستوفى منه»: قيل للمالك
 * «أكّد كلَّ علامةٍ تملكها وأطفئ ما لا تملك» وهو لا يستطيع.
 */
export type AdminTrustMark = TrustMarkView & {
  kind: TrustMarkKind;
  active: boolean;
  sort: number;
};

export async function adminTrustMarks(): Promise<AdminTrustMark[]> {
  const rows = await db.trustMark.findMany({
    orderBy: [{ kind: 'asc' }, { sort: 'asc' }],
    select: {
      key: true, kind: true, nameAr: true, nameEn: true, logoPath: true,
      registrationNo: true, verifyUrl: true, active: true, sort: true,
    },
  });
  return rows;
}

export type TrustMarkInput = {
  registrationNo?: string | null;
  verifyUrl?: string | null;
  active?: boolean;
};

export type TrustMarkResult =
  | { ok: true; mark: AdminTrustMark }
  | { ok: false; reason: 'NOT_FOUND' | 'INVALID_URL' | 'INVALID_NUMBER' };

/**
 * **ورابطُ التحقّق يُفحص**: نصٌّ ليس عنوانًا يُطبع في `href` فيقود
 * إلى لا شيء، ومخطّطٌ غيرُ `https` على صفحةٍ آمنة يُحذّر منه المتصفّح.
 * والفارغُ سحبٌ للرابط لا قيمةٌ خاطئة.
 */
type UrlCheck = { keep: true } | { set: string | null } | { bad: true };

function cleanUrl(value: string | null | undefined): UrlCheck {
  if (value === undefined) return { keep: true };
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return { set: null };
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? { set: url.toString() } : { bad: true };
  } catch {
    return { bad: true };
  }
}

export async function updateTrustMark(
  admin: { id: string },
  key: string,
  input: TrustMarkInput,
  ip: string | null,
): Promise<TrustMarkResult> {
  const before = await db.trustMark.findUnique({ where: { key } });
  if (before === null) return { ok: false, reason: 'NOT_FOUND' };

  /** الرقمُ يُقارن خانةً بخانة، فيُقلَّم ولا يُعاد تنسيقُه. */
  let registrationNo: string | null | undefined;
  if (input.registrationNo !== undefined) {
    const trimmed = (input.registrationNo ?? '').trim();
    if (trimmed.length > 40) return { ok: false, reason: 'INVALID_NUMBER' };
    registrationNo = trimmed === '' ? null : trimmed;
  }

  const verify = cleanUrl(input.verifyUrl);
  if ('bad' in verify) return { ok: false, reason: 'INVALID_URL' };

  const mark = await db.trustMark.update({
    where: { key },
    data: {
      ...(registrationNo === undefined ? {} : { registrationNo }),
      ...('set' in verify ? { verifyUrl: verify.set } : {}),
      ...(input.active === undefined ? {} : { active: input.active }),
    },
    select: {
      key: true, kind: true, nameAr: true, nameEn: true, logoPath: true,
      registrationNo: true, verifyUrl: true, active: true, sort: true,
    },
  });

  /** **وكلُّ إجراء أدمن يكتب `AuditLog`** — ودعوى الموثوقية أولاها. */
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'TrustMark',
      entityId: key,
      action: 'trustmark.update',
      before: {
        registrationNo: before.registrationNo,
        verifyUrl: before.verifyUrl,
        active: before.active,
      },
      after: {
        registrationNo: mark.registrationNo,
        verifyUrl: mark.verifyUrl,
        active: mark.active,
      },
      ip,
    },
  });

  return { ok: true, mark };
}

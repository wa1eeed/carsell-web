import type { Prisma } from '@/generated/prisma/client';
import type { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '../auth/password';

/**
 * ═══ حساب الأدمن الأول — من البيئة، عند كل إقلاع ═══
 *
 * كانت كلمة الأدمن تُقرأ من البيئة **لحظة الزرع وحدها**. فمن غيّر
 * المتغيّر في لوحة النشر ظنّ أنه غيّر كلمته، والقاعدة تحمل التجزئة
 * القديمة — وتغييرٌ يُعتقد أنه وقع ولم يقع أسوأ من تغييرٍ يُرفض.
 * وإعادة الزرع ليست بديلًا: تمسح ما بُني.
 *
 * فهذا يُطبَّق عند كل إقلاع، **ولا يكتب إلا إن تغيّر شيء**.
 *
 * ═══ وثلاث خصائص تحكمه ═══
 *
 * **١· لا يمسّ سواه.** يُطابق ببريدٍ واحد. وبريدٌ جديد يُنشئ حسابًا
 * جديدًا ولا يهدم القديم — فمن أخطأ الكتابة لا يفقد لوحته.
 *
 * **٢· يفكّ القفل عند تعيين كلمة.** من نسي كلمته وحاول حتى أُقفل
 * حسابه يريد الدخول لا انتظار خمس عشرة دقيقة بعد أن أصلح السبب.
 *
 * ═══ وما لا يفعله ═══
 *
 * **لا يغيّر دورًا قائمًا.** حسابٌ موجود بدور `OPS` يبقى `OPS` ولو
 * سُمّي في `ADMIN_EMAIL`: رفعُ الصلاحية من متغيّر بيئة يجعل ترقية
 * الدور أثرًا جانبيًّا لتغيير كلمة مرور — وهو آخر مكانٍ تُراجَع فيه.
 */

/** يقبل `tx` أو `db` أو عميلًا مستقلًّا — فيُستدعى من الخادم ومن سكربت الإقلاع. */
type Writer = Pick<typeof db, 'adminUser' | 'auditLog'>;

/**
 * الحدّ الأدنى — **اثنتا عشرة**.
 *
 * والحساب يُفرج عن ضمانٍ ويطّلع على هويات، وعنوانه عامّ ومعروف.
 * فكلمةٌ قصيرة هنا ليست راحةً بل بابٌ مفتوح.
 */
export const MIN_ADMIN_PASSWORD = 12;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProvisionOutcome = 'created' | 'password_set' | 'unchanged';

export type ProvisionResult =
  | {
      ok: true;
      outcome: ProvisionOutcome;
      adminId: string;
    }
  | { ok: false; reason: 'INVALID_EMAIL' | 'WEAK_PASSWORD' };

export async function provisionSuperAdmin(
  writer: Writer,
  input: { email: string; password: string; name?: string },
  now: Date = new Date(),
): Promise<ProvisionResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, reason: 'INVALID_EMAIL' };
  if (input.password.length < MIN_ADMIN_PASSWORD) return { ok: false, reason: 'WEAK_PASSWORD' };

  const existing = await writer.adminUser.findUnique({ where: { email } });

  if (existing === null) {
    const created = await writer.adminUser.create({
      data: {
        email,
        name: input.name ?? email,
        role: 'SUPER_ADMIN',
        passwordHash: await hashPassword(input.password),
        // من ضبطها في البيئة اختارها — ولا يُطالَب بتغيير ما اختاره
        mustChangePassword: false,
        passwordChangedAt: now,
      },
    });

    await writeAudit(writer, created.id, 'admin.provisioned', { email }, now);
    return { ok: true, outcome: 'created', adminId: created.id };
  }

  if (await verifyPassword(input.password, existing.passwordHash)) {
    return { ok: true, outcome: 'unchanged', adminId: existing.id };
  }

  await writer.adminUser.update({
    where: { id: existing.id },
    data: {
      passwordHash: await hashPassword(input.password),
      passwordChangedAt: now,
      mustChangePassword: false,
      // القفل يُفكّ مع الكلمة الجديدة — سببُه زال
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  await writeAudit(writer, existing.id, 'admin.password_set', { email }, now);
  return { ok: true, outcome: 'password_set', adminId: existing.id };
}

/**
 * والأثر مكتوب — **بـ`actorType: 'system'`**.
 *
 * لا فاعل بشريّ هنا: من غيّر المتغيّر في لوحة النشر لا يُعرف اسمه من
 * داخل الحاوية. ونسبتُه إلى الحساب نفسه تقول «غيّر كلمته بنفسه» وهو
 * لم يفعل — والسجلّ يُقرأ في تحقيق.
 */
async function writeAudit(
  writer: Writer,
  adminId: string,
  action: string,
  after: Prisma.InputJsonObject,
  now: Date,
): Promise<void> {
  await writer.auditLog.create({
    data: {
      actorId: adminId,
      actorType: 'system',
      entity: 'AdminUser',
      entityId: adminId,
      action,
      before: {},
      after,
      ip: null,
      createdAt: now,
    },
  });
}

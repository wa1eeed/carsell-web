import type { Prisma } from '@/generated/prisma/client';
import type { AdminRole } from '@/generated/prisma/enums';
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
 * **٣· والدور يتبع الإعداد الذي سمّاه.** `ADMIN_TEAM` يكتب
 * `ops@x:OPS:كلمة` — فالدور **مُصرَّحٌ به** في السطر، وتركُ القديم
 * يجعل الإعداد يقول `FINANCE` والحساب يبقى `OPS`.
 *
 * ═══ وما لا يفعله ═══
 *
 * **لا يرفع دورًا لم يُسمَّ.** `ADMIN_EMAIL` لا تذكر دورًا — ويستنتج
 * `provisionSuperAdmin` أنه `SUPER_ADMIN`. فحسابٌ قائم بـ`READONLY`
 * كُتب بريده هناك (سهوًا أو لإعادة استعمال) **يبقى `READONLY`**:
 * ترقيةٌ مستنتَجةٌ من متغيّرٍ لتبديل كلمة هي الأثرُ الجانبيّ الذي
 * لا يُراجَع. والفرق بين البابين أن الأوّل يسمّي والثاني يستنتج.
 */

/** يقبل `tx` أو `db` أو عميلًا مستقلًّا — فيُستدعى من الخادم ومن سكربت الإقلاع. */
type Writer = Pick<typeof db, 'adminUser' | 'auditLog' | 'adminSession'>;

/**
 * الحدّ الأدنى — **اثنتا عشرة**.
 *
 * والحساب يُفرج عن ضمانٍ ويطّلع على هويات، وعنوانه عامّ ومعروف.
 * فكلمةٌ قصيرة هنا ليست راحةً بل بابٌ مفتوح.
 */
export const MIN_ADMIN_PASSWORD = 12;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProvisionOutcome = 'created' | 'password_set' | 'role_changed' | 'unchanged';

export type ProvisionResult =
  | {
      ok: true;
      outcome: ProvisionOutcome;
      adminId: string;
    }
  | { ok: false; reason: 'INVALID_EMAIL' | 'WEAK_PASSWORD' };

/**
 * ═══ وخمسةُ أدوارٍ من ستّة لا باب لها ═══
 *
 * `AdminRole` ستّة، والمصفوفة تُفصّل صلاحياتِ كلٍّ منها — **ولا
 * يُنشأ إلّا `SUPER_ADMIN`**: لا من اللوحة (قرارٌ معلَن: «من سرق
 * جلسةً لا يصنع لنفسه حسابًا ثانيًا»)، ولا من النشر (التوفير يكتب
 * الدور حرفيًّا).
 *
 * فلم تكن تُوجد في المنتج `SUPPORT` ولا `CONTENT` ولا `READONLY`
 * ولا `OPS` ولا `FINANCE` إلّا في البذرة — ومصفوفةٌ تحكم أدوارًا لا
 * يملكها أحد جردٌ على الورق.
 *
 * **والباب هو الذي أعلنته الشاشة**: متغيّرات النشر. فيُعمَّم التوفير
 * على الأدوار كلّها بدل أن يُفتح في اللوحة، فيبقى القرار قائمًا.
 */
export async function provisionAdmin(
  writer: Writer,
  input: {
    email: string;
    password: string;
    name?: string;
    role: AdminRole;
    /** الدور مستنتَجٌ لا مُصرَّحًا به — فلا يُرفَع به حسابٌ قائم */
    inferredRole?: true;
  },
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
        role: input.role,
        passwordHash: await hashPassword(input.password),
        // من ضبطها في البيئة اختارها — ولا يُطالَب بتغيير ما اختاره
        mustChangePassword: false,
        passwordChangedAt: now,
      },
    });

    await writeAudit(writer, created.id, 'admin.provisioned', { email }, now);
    return { ok: true, outcome: 'created', adminId: created.id };
  }

  const samePassword = await verifyPassword(input.password, existing.passwordHash);
  // الدور المستنتَج لا يُغيّر شيئًا — فهو «مطابق» دائمًا عند القائم
  const sameRole = input.inferredRole === true || existing.role === input.role;

  if (samePassword && sameRole) {
    return { ok: true, outcome: 'unchanged', adminId: existing.id };
  }

  /**
   * ═══ والدور يُفحص وحده — لا تبعًا للكلمة ═══
   *
   * أوّل صياغةٍ وضعت `role: input.role` **داخل فرع «الكلمة تغيّرت»**
   * وكتبت فوقه أن الدور يُحدَّث. ومن بدّل الدور في `ADMIN_TEAM`
   * وأبقى الكلمة يمرّ بـ`verifyPassword` فيُرجَع `unchanged` —
   * **فلا يقع التغيير**، ويقرأ مشغّلُ النشر سطرًا يقول «لا تغيير»
   * على إعدادٍ غيّره هو. وهو الحال الشائع: الأدوار تُراجَع أكثر
   * ممّا تُدوَّر الكلمات.
   */
  if (samePassword) {
    await writer.adminUser.update({
      where: { id: existing.id },
      data: { role: input.role },
    });

    /**
     * **وتغييرُ الدور يُبطل جلساته.** الدور يُقرأ من القاعدة في كل
     * طلب فالمنع يقع على الطلب التالي، لكنّ من خُفِّض دورُه يبقى
     * أمام لوحةٍ صُيّرت بصلاحيّته القديمة — وزرٌّ يراه ولا يملكه
     * يُقرأ عطلًا. والإلزام بدخولٍ جديد يُنهي الالتباس.
     */
    await writer.adminSession.updateMany({
      where: { adminUserId: existing.id, revokedAt: null },
      data: { revokedAt: now },
    });

    await writeAudit(
      writer, existing.id, 'admin.role_changed',
      { email, from: existing.role, to: input.role }, now,
    );
    return { ok: true, outcome: 'role_changed', adminId: existing.id };
  }

  await writer.adminUser.update({
    where: { id: existing.id },
    data: {
      passwordHash: await hashPassword(input.password),
      passwordChangedAt: now,
      mustChangePassword: false,
      // والدور المستنتَج لا يُكتب — انظر «ما لا يفعله» في الصدر
      ...(input.inferredRole === true ? {} : { role: input.role }),
      // القفل يُفكّ مع الكلمة الجديدة — سببُه زال
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  /**
   * والجلسات تموت بـ`passwordChangedAt` في `resolveAdminSession` —
   * فلا إبطال صريح هنا. **وأثرُ الدور يُكتب مستقلًّا** إن تغيّر:
   * سطرُ «بُدّلت كلمة المرور» لا يقول أن الصلاحية ارتفعت، والسجلّ
   * يُقرأ في تحقيق.
   */
  if (!sameRole) {
    await writeAudit(
      writer, existing.id, 'admin.role_changed',
      { email, from: existing.role, to: input.role }, now,
    );
  }

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

/**
 * السوبر أدمن — غلافٌ على `provisionAdmin` يحفظ المنادي القديم
 * (`prisma/admin-sync.ts`) ويُبقي الدور صريحًا في موضع الاستدعاء.
 */
export async function provisionSuperAdmin(
  writer: Writer,
  input: { email: string; password: string; name?: string },
  now: Date = new Date(),
): Promise<ProvisionResult> {
  return provisionAdmin(writer, { ...input, role: 'SUPER_ADMIN', inferredRole: true }, now);
}

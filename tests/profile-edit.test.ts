import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { checkIban, normalizeIban, setEmail, verifyIdentity } from '@/lib/domain/profile-edit';
import { profileCompletion } from '@/lib/domain/profile';

afterAll(async () => {
  await db.$disconnect();
});

/** حسابٌ طازج لكل حالة — والاختبار يحذف ما صنعه. */
async function freshUser() {
  return db.user.create({
    data: { phone: `05${String(Date.now()).slice(-8)}`, status: 'ACTIVE' },
  });
}

describe('الآيبان — والخانة المقلوبة تُمسك بخانتي التحقّق', () => {
  it('يقبل اللصق بمسافاته وعلامات اتّجاهه', () => {
    expect(normalizeIban('SA03 8000 0000 6080 1016 7519')).toBe('SA0380000000608010167519');
    expect(normalizeIban('‎sa03-8000-0000-6080-1016-7519‏')).toBe(
      'SA0380000000608010167519',
    );
  });

  it('الصحيح يمرّ، والمقلوب خانةً يُردّ', () => {
    expect(checkIban('SA03 8000 0000 6080 1016 7519').ok).toBe(true);

    /**
     * **طولٌ صحيح وبادئةٌ صحيحة لا يمنعان رقمًا خاطئًا** — والفرق أن
     * المال يذهب إلى حسابٍ آخر أو يُردّ بعد أسبوع. فالفحص على mod-97.
     */
    const wrong = checkIban('SA03 8000 0000 6080 1016 7511');
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toBe('CHECKSUM');
  });

  it('غير السعوديّ يُردّ باسمه لا بـ«غير صحيح»', () => {
    const other = checkIban('GB29NWBK60161331926819');
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.reason).toBe('NOT_SAUDI');
  });
});

describe('إكمال الملف يفكّ الحظر فعلًا', () => {
  it('البريد والهوية يفتحان الشراء، والآيبان يفتح البيع', async () => {
    const user = await freshUser();
    try {
      // مسجَّلٌ بلا شيء: لا يشتري ولا يبيع
      expect(profileCompletion(user).canBuy).toBe(false);

      expect((await setEmail(user.id, 'Probe@Carsell.One ')).ok).toBe(true);
      expect(
        (await verifyIdentity(user.id, { nationalId: '١٠٩٨٧٦٥٤٣٢', fullName: 'وليد المطيري' })).ok,
      ).toBe(true);

      const midway = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      // البريد يُخزَّن مطبَّعًا — لا كما كُتب
      expect(midway.email).toBe('probe@carsell.one');
      expect(profileCompletion(midway).canBuy).toBe(true);
      // والآيبان لم يُضف بعد، فالبيع ما زال مغلقًا
      expect(profileCompletion(midway).canSell).toBe(false);

      await db.user.update({
        where: { id: user.id },
        data: { iban: 'enc:probe' },
      });
      const done = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(profileCompletion(done).canSell).toBe(true);
    } finally {
      await db.auditLog.deleteMany({ where: { actorId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it('الرقم يُقبل بالأرقام العربية-الهندية، ويُخزَّن مشفّرًا لا خامًا', async () => {
    const user = await freshUser();
    try {
      await verifyIdentity(user.id, { nationalId: '٢٠١٢٣٤٥٦٧٨', fullName: 'أحمد بن سالم' });
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.idVerified).toBe(true);
      // لا يظهر الرقم خامًا في العمود — نسخةٌ من القاعدة ليست كشف هويّات
      expect(row.nationalIdEncrypted).not.toBeNull();
      expect(row.nationalIdEncrypted).not.toContain('2012345678');
    } finally {
      await db.auditLog.deleteMany({ where: { actorId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it('البريد المستعمل في حسابٍ آخر يُردّ', async () => {
    const first = await freshUser();
    const second = await freshUser();
    try {
      await setEmail(first.id, 'taken@carsell.one');
      const clash = await setEmail(second.id, 'taken@carsell.one');
      expect(clash.ok).toBe(false);
      if (!clash.ok) expect(clash.reason).toBe('TAKEN');
    } finally {
      await db.user.deleteMany({ where: { id: { in: [first.id, second.id] } } });
    }
  });
});

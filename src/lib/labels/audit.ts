/**
 * تسميات إجراءات التدقيق — **بالعربية، وفي الشاشة لا في النطاق**.
 *
 * والمفتاح الخام يبقى معروضًا لما لا تسمية له: سطرٌ يقول
 * `listing.review.approve` أوضح من سطرٍ يقول «إجراء» — والسجلّ يُقرأ
 * في تحقيق، فغموضُه أسوأ من قبحه.
 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'escrow.settled': 'أفرج عن الضمان للبائع',
  'admin.login.success': 'دخل إلى اللوحة',
  'admin.login.failed': 'محاولة دخول فاشلة',
  'admin.provisioned': 'أنشئ حساب أدمن من البيئة',
  'admin.password_set': 'بدلت كلمة مرور أدمن',
  'deadline.changed': 'عدل مهلة زمنية',
  'commission.changed': 'عدل قاعدة عمولة',
  'listing.review.approve': 'اعتمد إعلانا بعد المراجعة',
  'listing.review.return': 'أعاد إعلانا لصاحبه بملاحظة',
  'listing.review.reject': 'رفض إعلانا وأوقف الحساب',
  'report.review_listing': 'أحال إعلانا إلى المراجعة ببلاغ',
  'report.dismiss': 'صرف النظر عن بلاغ',
  'report.actioned': 'أغلق بلاغا بعد إجراء',
  'identity.verify': 'وثق هوية حساب',
  'identity.clarify': 'طلب توضيحا في التوثيق',
  'identity.reject': 'رفض توثيق هوية',
  'identity.view': 'اطلع على بيانات هوية',
  'otp.test_number': 'استعمل رقم تجربة',
};

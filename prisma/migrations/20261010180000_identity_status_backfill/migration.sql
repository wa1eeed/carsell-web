-- ملء `identityStatus` للصفوف التي وُثّقت بالراية وحدها.
--
-- `identityStatus` هي الحقيقة و`idVerified` مشتقٌّ منها، وكُتبت الراية
-- وحدها في البذرة وفي مسار «حسابي» — فصار المستخدم موثَّقًا في شاشة
-- الشراء ومجهولًا في شاشة توثيق الهوية، وطابورُها فارغ وهو مليء.
--
-- والاتّجاه واحد: من يحمل الراية حالتُه `VERIFIED`. والعكس لا يقع
-- (قِيس: صفر صفّ حالتُه VERIFIED وراياتُه false).
UPDATE "User"
SET "identityStatus" = 'VERIFIED'
WHERE "idVerified" = true
  AND "identityStatus" <> 'VERIFIED';

-- والنقضُ يعيد ما كان: الفهرسان، وسلوكُ الحذف السابق.
CREATE INDEX IF NOT EXISTS "ServiceRequest_sellerId_status_idx" ON "ServiceRequest"("sellerId", "status");
CREATE INDEX IF NOT EXISTS "User_identityStatus_identitySubmittedAt_idx" ON "User"("identityStatus", "identitySubmittedAt");

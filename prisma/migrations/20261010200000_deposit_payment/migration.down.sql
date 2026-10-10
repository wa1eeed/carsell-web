DROP INDEX IF EXISTS "Deposit_paymentId_key";
ALTER TABLE "Deposit" DROP CONSTRAINT IF EXISTS "Deposit_paymentId_fkey";
ALTER TABLE "Deposit" DROP COLUMN IF EXISTS "paymentId";

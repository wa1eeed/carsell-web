/*
  Warnings:

  - The `reviewReason` column on the `Listing` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `trimId` on table `PriceStat` required. This step will fail if there are existing NULL values in that column.
  - Made the column `city` on table `PriceStat` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ReviewReason" AS ENUM ('DUPLICATE_IMAGE', 'PRICE_OUTLIER', 'NEW_ACCOUNT_BURST', 'USER_REPORT');

-- DropForeignKey
ALTER TABLE "PriceStat" DROP CONSTRAINT "PriceStat_trimId_fkey";

-- AlterTable
ALTER TABLE "Listing" DROP COLUMN "reviewReason",
ADD COLUMN     "reviewReason" "ReviewReason";

-- AlterTable
ALTER TABLE "PriceStat" ALTER COLUMN "trimId" SET NOT NULL,
ALTER COLUMN "trimId" SET DEFAULT '*',
ALTER COLUMN "city" SET NOT NULL,
ALTER COLUMN "city" SET DEFAULT '*';

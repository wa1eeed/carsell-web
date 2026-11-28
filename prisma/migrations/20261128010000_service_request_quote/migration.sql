-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "quoteBase" DECIMAL(10,2),
ADD COLUMN     "quoteExtra" DECIMAL(10,2),
ADD COLUMN     "templateVersion" INTEGER;

-- CreateTable
CREATE TABLE "ServiceRequestAnswer" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceRequestAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceRequestAnswer_requestId_idx" ON "ServiceRequestAnswer"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequestAnswer_requestId_key_key" ON "ServiceRequestAnswer"("requestId", "key");

-- AddForeignKey
ALTER TABLE "ServiceRequestAnswer" ADD CONSTRAINT "ServiceRequestAnswer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;


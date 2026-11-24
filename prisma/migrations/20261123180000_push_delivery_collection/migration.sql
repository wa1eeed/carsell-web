-- AlterTable
ALTER TABLE "PushChannel" ADD COLUMN     "badge" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sound" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PushPermission" (
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "platform" TEXT,

    CONSTRAINT "PushPermission_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PushSend" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "userId" TEXT,
    "templateKey" TEXT,
    "platform" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "failReason" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),

    CONSTRAINT "PushSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushPermission_status_idx" ON "PushPermission"("status");

-- CreateIndex
CREATE INDEX "PushSend_channelKey_sentAt_idx" ON "PushSend"("channelKey", "sentAt");

-- CreateIndex
CREATE INDEX "PushSend_userId_sentAt_idx" ON "PushSend"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "PushSend_status_idx" ON "PushSend"("status");

-- AddForeignKey
ALTER TABLE "PushPermission" ADD CONSTRAINT "PushPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSend" ADD CONSTRAINT "PushSend_channelKey_fkey" FOREIGN KEY ("channelKey") REFERENCES "PushChannel"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSend" ADD CONSTRAINT "PushSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


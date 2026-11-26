-- CreateTable
CREATE TABLE "DealerSite" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tagline" TEXT,
    "accent" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "customDomain" TEXT,
    "domainToken" TEXT,
    "domainVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerSite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealerSite_dealerId_key" ON "DealerSite"("dealerId");

-- CreateIndex
CREATE UNIQUE INDEX "DealerSite_slug_key" ON "DealerSite"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "DealerSite_customDomain_key" ON "DealerSite"("customDomain");

-- AddForeignKey
ALTER TABLE "DealerSite" ADD CONSTRAINT "DealerSite_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


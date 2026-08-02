-- CreateTable
CREATE TABLE "BodyTypeDisplay" (
    "key" "BodyType" NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BodyTypeDisplay_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "BodyTypeDisplay_visible_sort_idx" ON "BodyTypeDisplay"("visible", "sort");

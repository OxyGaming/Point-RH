-- CreateTable
CREATE TABLE "ZeroLoadPrefix" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prefixe" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ZeroLoadPrefix_prefixe_key" ON "ZeroLoadPrefix"("prefixe");

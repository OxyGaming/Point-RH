-- CreateTable
CREATE TABLE "UserAgentFilterItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filterId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAgentFilterItem_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "UserAgentFilter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserAgentFilterItem_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UserAgentFilterItem_filterId_idx" ON "UserAgentFilterItem"("filterId");

-- CreateIndex
CREATE INDEX "UserAgentFilterItem_agentId_idx" ON "UserAgentFilterItem"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAgentFilterItem_filterId_agentId_key" ON "UserAgentFilterItem"("filterId", "agentId");

-- Backfill : explose UserAgentFilter.selectedIds (JSON) en lignes relationnelles.
-- INSERT OR IGNORE gère la déduplication via l'index UNIQUE (filterId, agentId).
-- EXISTS filtre les IDs orphelins (agent supprimé physiquement) et les agents soft-deleted.
-- lower(hex(randomblob(16))) génère un id unique compatible avec le type TEXT.
INSERT OR IGNORE INTO "UserAgentFilterItem" ("id", "filterId", "agentId", "createdAt")
SELECT
    lower(hex(randomblob(16))),
    f."id",
    je."value",
    CURRENT_TIMESTAMP
FROM "UserAgentFilter" f, json_each(f."selectedIds") je
WHERE EXISTS (
    SELECT 1 FROM "Agent" a
    WHERE a."id" = je."value"
      AND a."deletedAt" IS NULL
);

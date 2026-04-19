-- Drop UserAgentFilter.selectedIds : données déjà migrées vers UserAgentFilterItem.
-- Reconstruction de la table (pattern SQLite standard pour drop column).
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserAgentFilter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserAgentFilter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserAgentFilter" ("createdAt", "id", "isActive", "updatedAt", "userId") SELECT "createdAt", "id", "isActive", "updatedAt", "userId" FROM "UserAgentFilter";
DROP TABLE "UserAgentFilter";
ALTER TABLE "new_UserAgentFilter" RENAME TO "UserAgentFilter";
CREATE UNIQUE INDEX "UserAgentFilter_userId_key" ON "UserAgentFilter"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

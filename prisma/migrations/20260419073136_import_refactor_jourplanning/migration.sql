/*
  Warnings:

  - Added the required column `jourPlanning` to the `PlanningLigne` table without a default value. This is not possible if the table is not empty.
  - Made the column `importId` on table `PlanningLigne` required. This step will fail if there are existing NULL values in that column.
  - Made the column `importId` on table `Simulation` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlanningImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nbLignes" INTEGER NOT NULL,
    "nbAgents" INTEGER NOT NULL,
    "erreurs" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_PlanningImport" ("erreurs", "filename", "id", "importedAt", "nbAgents", "nbLignes") SELECT "erreurs", "filename", "id", "importedAt", "nbAgents", "nbLignes" FROM "PlanningImport";
DROP TABLE "PlanningImport";
ALTER TABLE "new_PlanningImport" RENAME TO "PlanningImport";
CREATE TABLE "new_PlanningLigne" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importId" TEXT NOT NULL,
    "agentId" TEXT,
    "uch" TEXT,
    "codeUch" TEXT,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "codeApes" TEXT,
    "codeSymboleGrade" TEXT,
    "codeCollegeGrade" INTEGER,
    "dateDebutPop" DATETIME NOT NULL,
    "heureDebutPop" TEXT NOT NULL,
    "heureFinPop" TEXT NOT NULL,
    "dateFinPop" DATETIME NOT NULL,
    "amplitudeCentesimal" INTEGER,
    "amplitudeHHMM" TEXT,
    "dureeEffectiveCent" INTEGER,
    "dureeEffectiveHHMM" TEXT,
    "jsNpo" TEXT NOT NULL,
    "codeJs" TEXT,
    "typeJs" TEXT,
    "valeurNpo" INTEGER,
    "uchJs" TEXT,
    "codeUchJs" TEXT,
    "codeRoulementJs" TEXT,
    "numeroJs" TEXT,
    "jourPlanning" DATETIME NOT NULL,
    CONSTRAINT "PlanningLigne_importId_fkey" FOREIGN KEY ("importId") REFERENCES "PlanningImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanningLigne_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlanningLigne" ("agentId", "amplitudeCentesimal", "amplitudeHHMM", "codeApes", "codeCollegeGrade", "codeJs", "codeRoulementJs", "codeSymboleGrade", "codeUch", "codeUchJs", "dateDebutPop", "dateFinPop", "dureeEffectiveCent", "dureeEffectiveHHMM", "heureDebutPop", "heureFinPop", "id", "importId", "jsNpo", "matricule", "nom", "numeroJs", "prenom", "typeJs", "uch", "uchJs", "valeurNpo") SELECT "agentId", "amplitudeCentesimal", "amplitudeHHMM", "codeApes", "codeCollegeGrade", "codeJs", "codeRoulementJs", "codeSymboleGrade", "codeUch", "codeUchJs", "dateDebutPop", "dateFinPop", "dureeEffectiveCent", "dureeEffectiveHHMM", "heureDebutPop", "heureFinPop", "id", "importId", "jsNpo", "matricule", "nom", "numeroJs", "prenom", "typeJs", "uch", "uchJs", "valeurNpo" FROM "PlanningLigne";
DROP TABLE "PlanningLigne";
ALTER TABLE "new_PlanningLigne" RENAME TO "PlanningLigne";
CREATE INDEX "PlanningLigne_agentId_idx" ON "PlanningLigne"("agentId");
CREATE INDEX "PlanningLigne_importId_idx" ON "PlanningLigne"("importId");
CREATE INDEX "PlanningLigne_matricule_idx" ON "PlanningLigne"("matricule");
CREATE INDEX "PlanningLigne_dateDebutPop_idx" ON "PlanningLigne"("dateDebutPop");
CREATE INDEX "PlanningLigne_dateFinPop_idx" ON "PlanningLigne"("dateFinPop");
CREATE INDEX "PlanningLigne_jourPlanning_idx" ON "PlanningLigne"("jourPlanning");
CREATE UNIQUE INDEX "PlanningLigne_matricule_jourPlanning_key" ON "PlanningLigne"("matricule", "jourPlanning");
CREATE TABLE "new_Simulation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importId" TEXT NOT NULL,
    "dateDebut" DATETIME NOT NULL,
    "dateFin" DATETIME NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "poste" TEXT NOT NULL,
    "remplacement" BOOLEAN NOT NULL DEFAULT false,
    "deplacement" BOOLEAN NOT NULL DEFAULT false,
    "posteNuit" BOOLEAN NOT NULL DEFAULT false,
    "commentaire" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Simulation_importId_fkey" FOREIGN KEY ("importId") REFERENCES "PlanningImport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Simulation" ("commentaire", "createdAt", "dateDebut", "dateFin", "deplacement", "heureDebut", "heureFin", "id", "importId", "poste", "posteNuit", "remplacement") SELECT "commentaire", "createdAt", "dateDebut", "dateFin", "deplacement", "heureDebut", "heureFin", "id", "importId", "poste", "posteNuit", "remplacement" FROM "Simulation";
DROP TABLE "Simulation";
ALTER TABLE "new_Simulation" RENAME TO "Simulation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

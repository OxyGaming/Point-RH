-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "registrationStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "registrationComment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matricule" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "uch" TEXT,
    "codeUch" TEXT,
    "codeApes" TEXT,
    "codeSymboleGrade" TEXT,
    "codeCollegeGrade" INTEGER,
    "posteAffectation" TEXT,
    "agentReserve" BOOLEAN NOT NULL DEFAULT false,
    "peutFaireNuit" BOOLEAN NOT NULL DEFAULT true,
    "peutEtreDeplace" BOOLEAN NOT NULL DEFAULT false,
    "regimeB" BOOLEAN NOT NULL DEFAULT false,
    "regimeC" BOOLEAN NOT NULL DEFAULT false,
    "habilitations" TEXT NOT NULL DEFAULT '[]',
    "lpaBaseId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedByEmail" TEXT,
    CONSTRAINT "Agent_lpaBaseId_fkey" FOREIGN KEY ("lpaBaseId") REFERENCES "Lpa" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanningImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nbLignes" INTEGER NOT NULL,
    "nbAgents" INTEGER NOT NULL,
    "erreurs" TEXT NOT NULL DEFAULT '[]'
);

-- CreateTable
CREATE TABLE "PlanningLigne" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importId" TEXT,
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
    CONSTRAINT "PlanningLigne_importId_fkey" FOREIGN KEY ("importId") REFERENCES "PlanningImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanningLigne_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importId" TEXT,
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
    CONSTRAINT "Simulation_importId_fkey" FOREIGN KEY ("importId") REFERENCES "PlanningImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResultatAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "simulationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "scorePertinence" INTEGER NOT NULL DEFAULT 0,
    "motifPrincipal" TEXT,
    "detail" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "ResultatAgent_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResultatAgent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "category" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JsType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "heureDebutStandard" TEXT NOT NULL,
    "heureFinStandard" TEXT NOT NULL,
    "dureeStandard" INTEGER NOT NULL,
    "estNuit" BOOLEAN NOT NULL DEFAULT false,
    "regime" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "flexibilite" TEXT NOT NULL DEFAULT 'OBLIGATOIRE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lpa" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LpaJsType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lpaId" TEXT NOT NULL,
    "jsTypeId" TEXT NOT NULL,
    CONSTRAINT "LpaJsType_lpaId_fkey" FOREIGN KEY ("lpaId") REFERENCES "Lpa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LpaJsType_jsTypeId_fkey" FOREIGN KEY ("jsTypeId") REFERENCES "JsType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NpoExclusionCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentJsDeplacementRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "jsTypeId" TEXT,
    "prefixeJs" TEXT,
    "horsLpa" BOOLEAN,
    "tempsTrajetAllerMinutes" INTEGER NOT NULL DEFAULT 0,
    "tempsTrajetRetourMinutes" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentJsDeplacementRule_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentJsDeplacementRule_jsTypeId_fkey" FOREIGN KEY ("jsTypeId") REFERENCES "JsType" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_matricule_key" ON "Agent"("matricule");

-- CreateIndex
CREATE INDEX "Agent_deletedAt_idx" ON "Agent"("deletedAt");

-- CreateIndex
CREATE INDEX "PlanningLigne_agentId_idx" ON "PlanningLigne"("agentId");

-- CreateIndex
CREATE INDEX "PlanningLigne_importId_idx" ON "PlanningLigne"("importId");

-- CreateIndex
CREATE INDEX "PlanningLigne_matricule_idx" ON "PlanningLigne"("matricule");

-- CreateIndex
CREATE INDEX "PlanningLigne_dateDebutPop_idx" ON "PlanningLigne"("dateDebutPop");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningLigne_matricule_dateDebutPop_heureDebutPop_key" ON "PlanningLigne"("matricule", "dateDebutPop", "heureDebutPop");

-- CreateIndex
CREATE INDEX "ResultatAgent_simulationId_idx" ON "ResultatAgent"("simulationId");

-- CreateIndex
CREATE INDEX "ResultatAgent_agentId_idx" ON "ResultatAgent"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkRule_key_key" ON "WorkRule"("key");

-- CreateIndex
CREATE UNIQUE INDEX "JsType_code_key" ON "JsType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Lpa_code_key" ON "Lpa"("code");

-- CreateIndex
CREATE INDEX "LpaJsType_lpaId_idx" ON "LpaJsType"("lpaId");

-- CreateIndex
CREATE UNIQUE INDEX "LpaJsType_lpaId_jsTypeId_key" ON "LpaJsType"("lpaId", "jsTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "NpoExclusionCode_code_key" ON "NpoExclusionCode"("code");

-- CreateIndex
CREATE INDEX "AgentJsDeplacementRule_agentId_idx" ON "AgentJsDeplacementRule"("agentId");

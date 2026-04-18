# Import Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la liste "Imports récents" par un bandeau global "Données disponibles", passer les PlanningLigne sur un upsert par clé métier `(matricule, jourPlanning)`, et afficher un résultat d'import détaillé (lignes créées/mises à jour, agents créés/mis à jour).

**Architecture:** Ajout du champ `jourPlanning DateTime` + `@@unique([matricule, jourPlanning])` sur `PlanningLigne`. Le service d'import passe d'un `createMany` naïf à une stratégie deux passes (pré-chargement des clés existantes → partition toCreate/toUpdate → createMany + $transaction). Deux nouveaux composants : `ActiveDataBanner` (Server Component, requêtes Prisma directes) et `ImportResultMessage` (Client Component).

**Tech Stack:** Next.js 14, Prisma ORM, SQLite, TypeScript, date-fns-tz

---

## Fichiers touchés

| Fichier | Action |
|---|---|
| `prisma/schema.prisma` | Ajouter `jourPlanning`, `@@unique`, `@@index` sur `PlanningLigne` |
| `src/types/planning.ts` | Remplacer `ImportResult` par la version enrichie |
| `src/services/import.service.ts` | Upsert deux passes + `jourPlanningFromDate` + nouveaux compteurs |
| `src/app/api/import/route.ts` | Propager nouveaux champs dans audit + supprimer GET obsolète |
| `src/components/import/ActiveDataBanner.tsx` | Créer — Server Component bandeau global |
| `src/components/import/ImportResultMessage.tsx` | Créer — Client Component résultat détaillé |
| `src/components/import/ImportForm.tsx` | Utiliser `ImportResultMessage` + `router.refresh()` |
| `src/app/import/page.tsx` | Supprimer liste imports, intégrer `ActiveDataBanner` |

---

## Task 1 : Schema + migration + date-fns-tz

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `package.json` (via npm install)
- Create: `prisma/migrations/*/migration.sql` (auto-généré)

- [ ] **Step 1 : Vider PlanningLigne et PlanningImport avant migration**

Le nouveau champ `jourPlanning` est NOT NULL. Les lignes existantes n'ont pas de valeur pour ce champ — la migration échouerait. Les données sont reconstituables par ré-import.

```bash
cd "C:/Users/PC/Desktop/Point RH/point-rh"
npx prisma db execute --stdin <<'EOF'
DELETE FROM "PlanningLigne";
DELETE FROM "PlanningImport";
EOF
```

Expected : commande sans erreur (0 rows affected si déjà vide).

> ⚠️ Ceci supprime toutes les lignes de planning. Les agents sont préservés. Ré-importez vos fichiers après la migration.

- [ ] **Step 2 : Installer date-fns-tz**

```bash
npm install date-fns-tz
```

Expected : `date-fns-tz` apparaît dans `package.json` sous `dependencies`.

- [ ] **Step 3 : Mettre à jour schema.prisma — bloc PlanningLigne**

Dans `prisma/schema.prisma`, remplacer le modèle `PlanningLigne` (lignes 119–157) par :

```prisma
model PlanningLigne {
  id               String   @id @default(cuid())
  importId         String
  agentId          String?
  uch              String?
  codeUch          String?
  nom              String
  prenom           String
  matricule        String
  codeApes         String?
  codeSymboleGrade String?
  codeCollegeGrade Int?

  dateDebutPop        DateTime
  heureDebutPop       String
  heureFinPop         String
  dateFinPop          DateTime
  amplitudeCentesimal Int?
  amplitudeHHMM       String?
  dureeEffectiveCent  Int?
  dureeEffectiveHHMM  String?

  jsNpo           String
  codeJs          String?
  typeJs          String?
  valeurNpo       Int?
  uchJs           String?
  codeUchJs       String?
  codeRoulementJs String?
  numeroJs        String?

  jourPlanning DateTime

  import PlanningImport @relation(fields: [importId], references: [id], onDelete: Cascade)
  agent  Agent?         @relation(fields: [agentId], references: [id])

  @@unique([matricule, jourPlanning])
  @@index([agentId])
  @@index([importId])
  @@index([matricule])
  @@index([dateDebutPop])
  @@index([dateFinPop])
  @@index([jourPlanning])
}
```

- [ ] **Step 4 : Générer et appliquer la migration**

```bash
npx prisma migrate dev --name add-jour-planning-unique
```

Expected : `✓ Your database is now in sync with your schema.`

- [ ] **Step 5 : Vérifier la migration**

```bash
npx prisma studio
```

Ouvrir `http://localhost:5555` → table `PlanningLigne` → confirmer que la colonne `jourPlanning` existe et que la table est vide.

- [ ] **Step 6 : Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ package.json package-lock.json
git commit -m "feat: PlanningLigne — jourPlanning + @@unique(matricule, jourPlanning) + date-fns-tz"
```

---

## Task 2 : Mettre à jour ImportResult dans src/types/planning.ts

**Files:**
- Modify: `src/types/planning.ts`

- [ ] **Step 1 : Remplacer l'interface ImportResult (lignes 43–50)**

```ts
export interface ImportResult {
  success: boolean;
  importId?: string;
  lignesCreees: number;
  lignesMisesAJour: number;
  agentsCreated: number;
  agentsUpdated: number;
  fileType?: "excel" | "txt";
  erreurs: ImportErreur[];
}
```

- [ ] **Step 2 : Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```

Expected : des erreurs apparaissent sur `import.service.ts`, `ImportForm.tsx`, et `route.ts` qui utilisent encore les anciens champs `nbLignes` / `nbAgents`. C'est normal — elles seront corrigées dans les tâches suivantes.

- [ ] **Step 3 : Commit**

```bash
git add src/types/planning.ts
git commit -m "feat: ImportResult — lignesCreees, lignesMisesAJour, agentsCreated, agentsUpdated"
```

---

## Task 3 : Refactorer import.service.ts

**Files:**
- Modify: `src/services/import.service.ts`

- [ ] **Step 1 : Réécrire import.service.ts**

Remplacer le contenu entier du fichier :

```ts
/**
 * Service d'import planning — orchestrateur principal
 *
 * Pipeline :
 *   1. Détection du type de fichier (Excel / TXT)
 *   2. Lecture + parsing (parseExcelRows / parseTxtRows)
 *   3. Validation des en-têtes
 *   4. Normalisation métier commune (normalizeRows)
 *   5. Persistance en base (upsert agents + upsert lignes par clé métier)
 *
 * Clé métier PlanningLigne : (matricule, jourPlanning)
 * jourPlanning = minuit heure locale Europe/Paris du jour de dateDebutPop.
 * Un agent a au plus une affectation par jour calendaire.
 */
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import type { ImportResult } from "@/types/planning";
import { validateHeaders } from "./import/headers";
import { parseExcelRows } from "./import/parseExcel";
import { parseTxtRows } from "./import/parseTxt";
import { normalizeRows } from "./import/normalizeRows";

export type FileType = "excel" | "txt";

function detectFileType(filename: string): FileType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (lower.endsWith(".txt")) return "txt";
  return null;
}

function jourPlanningFromDate(dateDebutPop: Date): Date {
  const paris = toZonedTime(dateDebutPop, "Europe/Paris");
  return fromZonedTime(
    new Date(paris.getFullYear(), paris.getMonth(), paris.getDate()),
    "Europe/Paris"
  );
}

// ─── Entrée principale ────────────────────────────────────────────────────────

export async function importerPlanning(
  buffer: Buffer,
  filename: string
): Promise<ImportResult> {
  // 1. Détecter le type
  const fileType = detectFileType(filename);
  if (!fileType) {
    return {
      success: false, lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0, fileType: undefined,
      erreurs: [{ ligne: 0, message: `Format de fichier non supporté : ${filename}` }],
    };
  }

  // 2. Parser selon le type
  let parseResult: ReturnType<typeof parseExcelRows>;
  try {
    parseResult = fileType === "excel"
      ? parseExcelRows(buffer)
      : parseTxtRows(buffer);
  } catch (err) {
    return {
      success: false, lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0, fileType,
      erreurs: [{ ligne: 0, message: `Erreur de lecture du fichier : ${String(err)}` }],
    };
  }

  const { headers, rows } = parseResult;

  if (rows.length === 0) {
    return {
      success: false, lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0, fileType,
      erreurs: [{ ligne: 0, message: "Fichier vide ou aucune ligne de données trouvée" }],
    };
  }

  // 3. Valider les en-têtes
  const headerValidation = validateHeaders(headers);
  if (!headerValidation.valid) {
    return {
      success: false, lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0, fileType,
      erreurs: headerValidation.missing.map((col) => ({
        ligne: 0,
        champ: col,
        message: `Colonne obligatoire manquante : "${col}"`,
      })),
    };
  }

  // 4. Normaliser les lignes
  const { lignes: lignesRaw, erreurs } = normalizeRows(rows, headers);

  if (lignesRaw.length === 0) {
    return {
      success: false, lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0, fileType,
      erreurs: [
        ...erreurs,
        { ligne: 0, message: "Aucune ligne valide après normalisation" },
      ],
    };
  }

  // 5. Persister en base
  try {
    // ── Agents : upsert + tracking créés/mis à jour ──────────────────────────
    const matriculesDuFichier = [...new Set(lignesRaw.map((l) => l.matricule))];

    const agentsExistants = await prisma.agent.findMany({
      where: { matricule: { in: matriculesDuFichier } },
      select: { matricule: true },
    });
    const matriculesExistants = new Set(agentsExistants.map((a) => a.matricule));

    let agentsCreated = 0;
    let agentsUpdated = 0;
    const agentsMap = new Map<string, string>();
    const matriculesVus = new Set<string>();

    for (const l of lignesRaw) {
      if (matriculesVus.has(l.matricule)) continue;
      matriculesVus.add(l.matricule);

      const agent = await prisma.agent.upsert({
        where: { matricule: l.matricule },
        update: {
          nom: l.nom, prenom: l.prenom, uch: l.uch, codeUch: l.codeUch,
          codeApes: l.codeApes, codeSymboleGrade: l.codeSymboleGrade,
          codeCollegeGrade: l.codeCollegeGrade,
        },
        create: {
          matricule: l.matricule, nom: l.nom, prenom: l.prenom,
          uch: l.uch, codeUch: l.codeUch, codeApes: l.codeApes,
          codeSymboleGrade: l.codeSymboleGrade, codeCollegeGrade: l.codeCollegeGrade,
          habilitations: "[]",
        },
      });
      agentsMap.set(l.matricule, agent.id);

      if (matriculesExistants.has(l.matricule)) {
        agentsUpdated++;
      } else {
        agentsCreated++;
      }
    }

    // ── Import record ─────────────────────────────────────────────────────────
    await prisma.planningImport.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    const planningImport = await prisma.planningImport.create({
      data: {
        filename,
        nbLignes: lignesRaw.length,
        nbAgents: matriculesVus.size,
        erreurs: JSON.stringify(erreurs),
        isActive: true,
      },
    });

    // ── Lignes : upsert par (matricule, jourPlanning) ─────────────────────────
    const lignesAvecJour = lignesRaw.map((l) => ({
      ...l,
      jourPlanning: jourPlanningFromDate(l.dateDebutPop),
    }));

    const existingLignes = await prisma.planningLigne.findMany({
      where: {
        matricule: { in: matriculesDuFichier },
        jourPlanning: { in: lignesAvecJour.map((l) => l.jourPlanning) },
      },
      select: { matricule: true, jourPlanning: true },
    });
    const existingKeys = new Set(
      existingLignes.map((k) => `${k.matricule}|${k.jourPlanning.toISOString()}`)
    );

    const toCreate: typeof lignesAvecJour = [];
    const toUpdate: typeof lignesAvecJour = [];
    for (const l of lignesAvecJour) {
      const key = `${l.matricule}|${l.jourPlanning.toISOString()}`;
      if (existingKeys.has(key)) {
        toUpdate.push(l);
      } else {
        toCreate.push(l);
      }
    }

    if (toCreate.length > 0) {
      await prisma.planningLigne.createMany({
        data: toCreate.map((l) => ({
          importId: planningImport.id,
          agentId: agentsMap.get(l.matricule) ?? null,
          uch: l.uch, codeUch: l.codeUch, nom: l.nom, prenom: l.prenom,
          matricule: l.matricule, codeApes: l.codeApes,
          codeSymboleGrade: l.codeSymboleGrade, codeCollegeGrade: l.codeCollegeGrade,
          dateDebutPop: l.dateDebutPop, heureDebutPop: l.heureDebutPop,
          heureFinPop: l.heureFinPop, dateFinPop: l.dateFinPop,
          amplitudeCentesimal: l.amplitudeCentesimal, amplitudeHHMM: l.amplitudeHHMM,
          dureeEffectiveCent: l.dureeEffectiveCent, dureeEffectiveHHMM: l.dureeEffectiveHHMM,
          jsNpo: l.jsNpo, codeJs: l.codeJs, typeJs: l.typeJs,
          valeurNpo: l.valeurNpo, uchJs: l.uchJs, codeUchJs: l.codeUchJs,
          codeRoulementJs: l.codeRoulementJs, numeroJs: l.numeroJs,
          jourPlanning: l.jourPlanning,
        })),
      });
    }

    if (toUpdate.length > 0) {
      await prisma.$transaction(
        toUpdate.map((l) =>
          prisma.planningLigne.update({
            where: {
              matricule_jourPlanning: {
                matricule: l.matricule,
                jourPlanning: l.jourPlanning,
              },
            },
            data: {
              importId: planningImport.id,
              agentId: agentsMap.get(l.matricule) ?? null,
              uch: l.uch, codeUch: l.codeUch, nom: l.nom, prenom: l.prenom,
              codeApes: l.codeApes,
              codeSymboleGrade: l.codeSymboleGrade, codeCollegeGrade: l.codeCollegeGrade,
              dateDebutPop: l.dateDebutPop, heureDebutPop: l.heureDebutPop,
              heureFinPop: l.heureFinPop, dateFinPop: l.dateFinPop,
              amplitudeCentesimal: l.amplitudeCentesimal, amplitudeHHMM: l.amplitudeHHMM,
              dureeEffectiveCent: l.dureeEffectiveCent, dureeEffectiveHHMM: l.dureeEffectiveHHMM,
              jsNpo: l.jsNpo, codeJs: l.codeJs, typeJs: l.typeJs,
              valeurNpo: l.valeurNpo, uchJs: l.uchJs, codeUchJs: l.codeUchJs,
              codeRoulementJs: l.codeRoulementJs, numeroJs: l.numeroJs,
            },
          })
        )
      );
    }

    return {
      success: true,
      importId: planningImport.id,
      lignesCreees: toCreate.length,
      lignesMisesAJour: toUpdate.length,
      agentsCreated,
      agentsUpdated,
      fileType,
      erreurs,
    };
  } catch (err) {
    return {
      success: false, lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0, fileType,
      erreurs: [{ ligne: 0, message: `Erreur base de données : ${String(err)}` }],
    };
  }
}

// Compat : l'ancien nom reste exporté
export { importerPlanning as importerPlanningExcel };
```

- [ ] **Step 2 : Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```

Expected : plus d'erreurs sur `import.service.ts`. Des erreurs restent sur `route.ts` et `ImportForm.tsx` — corrigées aux tasks suivantes.

- [ ] **Step 3 : Commit**

```bash
git add src/services/import.service.ts
git commit -m "feat: upsert PlanningLigne par (matricule, jourPlanning) + compteurs métier"
```

---

## Task 4 : Mettre à jour la route API import

**Files:**
- Modify: `src/app/api/import/route.ts`

- [ ] **Step 1 : Vérifier que GET /api/import n'est pas utilisé ailleurs**

```bash
grep -r "/api/import" "C:/Users/PC/Desktop/Point RH/point-rh/src" --include="*.ts" --include="*.tsx" | grep -v "route.ts"
```

Expected : aucun résultat. Si des résultats apparaissent, traiter ces usages avant de continuer.

- [ ] **Step 2 : Réécrire route.ts**

Remplacer le contenu entier du fichier :

```ts
/**
 * POST /api/import — Import d'un fichier planning (authentifié)
 *
 * RÈGLE DE GESTION — Persistance des agents :
 * Un import ne supprime JAMAIS les agents existants.
 * Les agents sont créés ou mis à jour (upsert par matricule).
 * Seule une action explicite d'un administrateur peut supprimer un agent.
 */
import { NextRequest, NextResponse } from "next/server";
import { importerPlanning } from "@/services/import.service";
import { checkAuth } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".txt"];
const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/tab-separated-values",
  "application/octet-stream",
];

function isFileAllowed(file: File): boolean {
  const lower = file.name.toLowerCase();
  const extOk = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const mimeOk = ALLOWED_MIME_TYPES.includes(file.type) || file.type === "";
  return extOk && mimeOk;
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    if (!isFileAllowed(file)) {
      return NextResponse.json(
        { error: `Format non supporté. Formats acceptés : ${ALLOWED_EXTENSIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await importerPlanning(buffer, file.name);

    if (result.success) {
      await logAudit("IMPORT_PLANNING", "PlanningImport", {
        user: auth.user,
        entityId: result.importId,
        details: {
          filename: file.name,
          lignesCreees: result.lignesCreees,
          lignesMisesAJour: result.lignesMisesAJour,
          agentsCreated: result.agentsCreated,
          agentsUpdated: result.agentsUpdated,
        },
      });
    }

    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (err) {
    console.error("[API/import]", err);
    return NextResponse.json({ error: "Erreur lors de l'import" }, { status: 500 });
  }
}
```

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```

Expected : plus d'erreurs sur `route.ts`.

- [ ] **Step 4 : Commit**

```bash
git add src/app/api/import/route.ts
git commit -m "feat: route import — nouveaux compteurs dans audit, suppression GET obsolète"
```

---

## Task 5 : Créer ActiveDataBanner

**Files:**
- Create: `src/components/import/ActiveDataBanner.tsx`

- [ ] **Step 1 : Créer le composant**

```tsx
import { prisma } from "@/lib/prisma";

export default async function ActiveDataBanner() {
  const [stats, agentCount] = await Promise.all([
    prisma.planningLigne.aggregate({
      _min: { dateDebutPop: true },
      _max: { dateFinPop: true },
      _count: { id: true },
    }),
    prisma.agent.count({ where: { deletedAt: null } }),
  ]);

  const nbLignes = stats._count.id;
  const dateMin = stats._min.dateDebutPop;
  const dateMax = stats._max.dateFinPop;
  const isEmpty = nbLignes === 0;

  const formatDate = (d: Date) =>
    d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="rounded-xl border border-[#e2e8f5] bg-white p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-[700] uppercase tracking-[0.12em] text-[#2563eb]">Planning</p>
          <h2 className="text-[15px] font-[700] text-[#0f1b4c] mt-0.5">Données disponibles</h2>
        </div>
        <span className="text-[10px] text-[#8b93b8] bg-[#f1f5f9] rounded-full px-2.5 py-1 font-[500]">
          Rétention 3 mois
        </span>
      </div>

      {isEmpty ? (
        <p className="text-[13px] text-[#8b93b8] text-center py-4 flex-1 flex items-center justify-center">
          Aucune donnée — importez un fichier de planning.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#f8fafc] rounded-lg px-3 py-3 text-center">
            <p className="text-[22px] font-[800] text-[#0f1b4c] font-mono leading-none">
              {agentCount}
            </p>
            <p className="text-[11px] text-[#8b93b8] mt-1">agents</p>
          </div>
          <div className="bg-[#f8fafc] rounded-lg px-3 py-3 text-center">
            <p className="text-[22px] font-[800] text-[#0f1b4c] font-mono leading-none">
              {nbLignes.toLocaleString("fr-FR")}
            </p>
            <p className="text-[11px] text-[#8b93b8] mt-1">lignes</p>
          </div>
          <div className="bg-[#f8fafc] rounded-lg px-3 py-3 text-center">
            {dateMin && dateMax ? (
              <>
                <p className="text-[11px] font-[700] text-[#0f1b4c] leading-tight">
                  {formatDate(dateMin)}
                </p>
                <p className="text-[10px] text-[#8b93b8] my-0.5">→</p>
                <p className="text-[11px] font-[700] text-[#0f1b4c] leading-tight">
                  {formatDate(dateMax)}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-[#8b93b8]">—</p>
            )}
            <p className="text-[11px] text-[#8b93b8] mt-1">plage</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```

Expected : aucune erreur sur ce fichier.

- [ ] **Step 3 : Commit**

```bash
git add src/components/import/ActiveDataBanner.tsx
git commit -m "feat: ActiveDataBanner — agents, lignes, plage de dates, rétention 3 mois"
```

---

## Task 6 : Créer ImportResultMessage

**Files:**
- Create: `src/components/import/ImportResultMessage.tsx`

- [ ] **Step 1 : Créer le composant**

```tsx
"use client";
import type { ImportResult } from "@/types/planning";
import { IconCheckCircle } from "@/components/icons/Icons";

interface Props {
  result: ImportResult;
}

export default function ImportResultMessage({ result }: Props) {
  if (!result.success) {
    return (
      <div className="mt-6 rounded-xl p-5 border bg-red-50 border-red-200">
        <p className="font-semibold text-red-800 mb-2">❌ Échec de l&apos;import</p>
        {result.erreurs.length > 0 && (
          <div className="mt-3 max-h-40 overflow-y-auto space-y-1">
            {result.erreurs.map((e, i) => (
              <div key={i} className="text-xs text-red-800 bg-red-100 rounded px-2 py-1">
                Ligne {e.ligne}{e.champ ? ` [${e.champ}]` : ""} — {e.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const rows = [
    { label: "Lignes créées",       value: result.lignesCreees,      color: "text-green-700" },
    { label: "Lignes mises à jour", value: result.lignesMisesAJour,  color: "text-blue-700"  },
    { label: "Agents créés",        value: result.agentsCreated,     color: "text-green-700" },
    { label: "Agents mis à jour",   value: result.agentsUpdated,     color: "text-blue-700"  },
  ];

  return (
    <div className="mt-6 rounded-xl p-5 border bg-green-50 border-green-200">
      <p className="font-semibold text-green-800 mb-3 inline-flex items-center gap-1.5">
        <IconCheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        Import terminé
      </p>
      <div className="space-y-1.5">
        {rows.map(({ label, value, color }) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-green-700">{label}</span>
            <span className={`font-mono font-semibold ${color}`}>{value}</span>
          </div>
        ))}
      </div>
      {result.erreurs.length > 0 && (
        <>
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-yellow-700">Erreurs ignorées</span>
            <span className="font-mono font-semibold text-yellow-700">{result.erreurs.length}</span>
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
            {result.erreurs.map((e, i) => (
              <div key={i} className="text-xs text-yellow-800 bg-yellow-50 rounded px-2 py-1">
                Ligne {e.ligne}{e.champ ? ` [${e.champ}]` : ""} — {e.message}
              </div>
            ))}
          </div>
        </>
      )}
      {result.fileType && (
        <p className="text-xs text-green-600 mt-2">
          Format : {result.fileType === "excel" ? "Excel" : "TXT tabulé"}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```

Expected : aucune erreur sur ce fichier.

- [ ] **Step 3 : Commit**

```bash
git add src/components/import/ImportResultMessage.tsx
git commit -m "feat: ImportResultMessage — résultat détaillé lignes et agents"
```

---

## Task 7 : Mettre à jour ImportForm.tsx

**Files:**
- Modify: `src/components/import/ImportForm.tsx`

- [ ] **Step 1 : Réécrire ImportForm.tsx**

Remplacer le contenu entier du fichier :

```tsx
"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { IconDownload } from "@/components/icons/Icons";
import type { ImportResult } from "@/types/planning";
import ImportResultMessage from "./ImportResultMessage";

export default function ImportForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data: ImportResult = await res.json();
      setResult(data);
      if (data.success) {
        router.refresh();
      }
    } catch {
      setResult({
        success: false,
        lignesCreees: 0, lignesMisesAJour: 0,
        agentsCreated: 0, agentsUpdated: 0,
        erreurs: [{ ligne: 0, message: "Erreur réseau" }],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.txt"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <IconDownload className="w-10 h-10 mb-3 mx-auto text-slate-500" aria-hidden="true" />
          {file ? (
            <div>
              <p className="font-semibold text-gray-800">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} Ko</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-700 font-medium">Glissez votre fichier ici</p>
              <p className="text-sm text-gray-500 mt-1">
                ou cliquez pour sélectionner (.xlsx, .xls, .txt)
              </p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!file || loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          {loading ? "Import en cours…" : "Importer le planning"}
        </button>
      </form>

      {result && <ImportResultMessage result={result} />}
    </div>
  );
}
```

Note : `router.push("/agents")` remplacé par `router.refresh()` pour rafraîchir le bandeau `ActiveDataBanner` sans quitter la page.

- [ ] **Step 2 : Vérifier la compilation TypeScript — zéro erreur attendu**

```bash
npx tsc --noEmit
```

Expected : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/components/import/ImportForm.tsx
git commit -m "feat: ImportForm — ImportResultMessage + router.refresh après import réussi"
```

---

## Task 8 : Mettre à jour import/page.tsx

**Files:**
- Modify: `src/app/import/page.tsx`

- [ ] **Step 1 : Réécrire import/page.tsx**

Remplacer le contenu entier du fichier :

```tsx
import ImportForm from "@/components/import/ImportForm";
import ActiveDataBanner from "@/components/import/ActiveDataBanner";
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "UCH", "CODE UCH", "NOM", "PRENOM", "CODE IMMATRICULATION",
  "CODE APES", "CODE SYMBOLE GRADE", "CODE COLLEGE GRADE",
  "DATE DEBUT POP / NPO", "HEURE DEBUT POP / NPO",
  "HEURE FIN POP / NPO", "DATE FIN POP / NPO",
  "AMPLITUDE POP / NPO (100E/HEURE)", "AMPLITUDE POP / NPO (HH:MM)",
  "DUREE EFFECTIVE POP (100E/HEURE)", "DUREE EFFECTIVE POP (HH:MM)",
  "JS / NPO", "CODE JS / CODE NPO", "TYPE JS / FAM. NPO",
  "VALEUR NPO", "UCH JS", "CODE UCH JS", "CODE ROULEMENT JS", "NUMERO JS",
];

export default async function ImportPage() {
  return (
    <div className="p-5 sm:p-7 lg:p-8 max-w-5xl">

      {/* Page header */}
      <div className="mb-7">
        <p className="text-[10px] font-[700] uppercase tracking-[0.12em] text-[#2563eb] mb-1">Planning</p>
        <h1 className="text-[26px] font-[800] text-[#0f1b4c] tracking-tight leading-none">Import du planning</h1>
        <p className="text-[13px] text-[#4a5580] mt-2">
          Importez un fichier Excel ou TXT tabulé de planning agents (format SNCF standard).
        </p>
      </div>

      {/* Règle de gestion */}
      <div className="mb-6 flex items-start gap-2.5 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl px-4 py-3">
        <svg className="w-4 h-4 text-[#2563eb] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p className="text-[12px] text-[#1e40af] font-[500]">
          L'import crée ou met à jour les agents, mais ne supprime jamais un agent existant. Les agents sont <strong>rémanents</strong>.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 mb-5">
        {/* Drop zone */}
        <Card>
          <CardHeader>
            <CardTitle>Nouveau fichier</CardTitle>
            <CardSubtitle>Glissez ou cliquez pour sélectionner</CardSubtitle>
          </CardHeader>
          <CardBody>
            <ImportForm />
          </CardBody>
        </Card>

        {/* Données disponibles */}
        <ActiveDataBanner />
      </div>

      {/* Colonnes attendues */}
      <Card>
        <CardHeader>
          <CardTitle>Colonnes attendues (Excel et TXT)</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1px", background: "#e2e8f5" }}>
            {COLUMNS.map((col) => (
              <span key={col} className="bg-white px-3 py-2 text-[11px] font-mono text-[#4a5580] truncate">
                {col}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier la compilation TypeScript — zéro erreur**

```bash
npx tsc --noEmit
```

Expected : aucune erreur.

- [ ] **Step 3 : Lancer le serveur de dev et vérifier visuellement**

```bash
npm run dev
```

Ouvrir `http://localhost:3000/import`. Vérifier :
- Le bandeau "Données disponibles" s'affiche à droite du formulaire
- Les 3 stats sont visibles (agents, lignes, plage) ou l'état vide si base vide
- Importer un fichier → `ImportResultMessage` affiche lignes créées/mises à jour, agents créés/mis à jour
- Après import réussi, le bandeau se rafraîchit avec les nouvelles valeurs
- Aucune erreur dans la console navigateur ni dans les logs serveur

- [ ] **Step 4 : Commit final**

```bash
git add src/app/import/page.tsx
git commit -m "feat: page import — ActiveDataBanner remplace liste imports récents"
```

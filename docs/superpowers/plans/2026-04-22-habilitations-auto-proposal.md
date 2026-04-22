# Habilitations Auto-Proposal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Après un import de planning réussi, proposer automatiquement à l'admin les habilitations (préfixes `codeJs`) manquantes par agent, avec validation case par case avant écriture en base.

**Architecture:** Un service pur (`habilitation-proposals.service.ts`) expose (a) une fonction `computeAgentProposals` testable unitairement qui compare habilitations actuelles et `codeJs` tenus, (b) deux fonctions DB `calculerPropositionsHabilitations` / `validerPropositions`. Deux endpoints API (`GET`/`POST` sous `/api/habilitations/propositions`) orchestrent auth admin + rate limit + audit. Un composant client `HabilitationsProposalsPanel` affiche les propositions sous `ImportResultMessage` et POST la sélection.

**Tech Stack:** Next.js 16 App Router (TS), Prisma + SQLite, Jest + ts-jest, React client components, Tailwind.

**Spec référence :** [`docs/superpowers/specs/2026-04-22-habilitations-auto-proposal-design.md`](../specs/2026-04-22-habilitations-auto-proposal-design.md)

---

## Fichiers créés / modifiés

| Fichier | Action | Responsabilité |
|---|---|---|
| `src/lib/audit.ts` | modifier | Ajouter `"HABILITATION_AUTO_VALIDATED"` au type `AuditAction`. |
| `src/services/habilitation-proposals.service.ts` | créer | Logique métier pure + accès DB (calcul + validation). |
| `src/__tests__/habilitationProposals.test.ts` | créer | Tests unitaires des fonctions pures. |
| `src/app/api/habilitations/propositions/route.ts` | créer | `GET` — renvoie les propositions (admin only). |
| `src/app/api/habilitations/propositions/valider/route.ts` | créer | `POST` — valide et merge en base (admin only, rate-limit). |
| `src/components/import/HabilitationsProposalsPanel.tsx` | créer | UI client : fetch + cases à cocher + validation. |
| `src/components/import/ImportForm.tsx` | modifier | Rendre le panneau sous `ImportResultMessage` quand `result.success && isAdmin`. Accepter un prop `isAdmin`. |
| `src/app/import/page.tsx` | modifier | Charger la session côté serveur et passer `isAdmin` à `ImportForm`. |

Aucune migration Prisma nécessaire.

---

## Task 1 — Étendre `AuditAction`

**Files:**
- Modify: `src/lib/audit.ts`

- [ ] **Step 1: Ajouter l'action à l'union**

Ouvrir `src/lib/audit.ts` et remplacer la définition du type `AuditAction` pour y ajouter `"HABILITATION_AUTO_VALIDATED"` en dernier item.

Remplacer :

```ts
export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE_USER"
  | "UPDATE_USER"
  | "DELETE_USER"
  | "DELETE_AGENT"
  | "UPDATE_AGENT"
  | "UPDATE_WORK_RULES"
  | "RESET_WORK_RULES"
  | "IMPORT_PLANNING"
  | "EXPORT_PARAMETRAGE"
  | "IMPORT_PARAMETRAGE"
  | "PURGE_SIMULATIONS"
  | "REGISTER_REQUEST"
  | "APPROVE_REGISTRATION"
  | "REJECT_REGISTRATION"
  | "RESTORE_AGENT"
  | "CLEANUP_PLANNING";
```

par :

```ts
export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE_USER"
  | "UPDATE_USER"
  | "DELETE_USER"
  | "DELETE_AGENT"
  | "UPDATE_AGENT"
  | "UPDATE_WORK_RULES"
  | "RESET_WORK_RULES"
  | "IMPORT_PLANNING"
  | "EXPORT_PARAMETRAGE"
  | "IMPORT_PARAMETRAGE"
  | "PURGE_SIMULATIONS"
  | "REGISTER_REQUEST"
  | "APPROVE_REGISTRATION"
  | "REJECT_REGISTRATION"
  | "RESTORE_AGENT"
  | "CLEANUP_PLANNING"
  | "HABILITATION_AUTO_VALIDATED";
```

- [ ] **Step 2: Vérifier que le projet compile**

Run : `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npx tsc --noEmit`
Expected : 0 error.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/PC/Desktop/Point RH/point-rh"
git add src/lib/audit.ts
git commit -m "chore(audit): add HABILITATION_AUTO_VALIDATED action type"
```

---

## Task 2 — Fonctions pures du service (TDD)

**Files:**
- Create: `src/services/habilitation-proposals.service.ts`
- Create: `src/__tests__/habilitationProposals.test.ts`

- [ ] **Step 1: Écrire les tests (avant tout code)**

Créer `src/__tests__/habilitationProposals.test.ts` avec exactement ce contenu :

```ts
import {
  isCouvert,
  mergerHabilitations,
  computeAgentProposals,
  type CodeJsTenu,
} from "@/services/habilitation-proposals.service";

describe("isCouvert", () => {
  it("renvoie true quand un préfixe est préfixe strict du code", () => {
    expect(isCouvert("GIC015", ["GIC"])).toBe(true);
  });

  it("renvoie true quand un préfixe est exactement égal au code", () => {
    expect(isCouvert("GIC", ["GIC"])).toBe(true);
  });

  it("renvoie false quand aucun préfixe ne matche", () => {
    expect(isCouvert("GIC015", ["BAD", "PEY"])).toBe(false);
  });

  it("renvoie false avec une liste de préfixes vide", () => {
    expect(isCouvert("GIC015", [])).toBe(false);
  });

  it("renvoie false si le préfixe est plus long que le code", () => {
    expect(isCouvert("GIC", ["GIC015"])).toBe(false);
  });
});

describe("mergerHabilitations", () => {
  it("union dédoublonnée triée alphabétiquement", () => {
    expect(mergerHabilitations(["BAD", "GIC"], ["GIC", "PEY"])).toEqual([
      "BAD",
      "GIC",
      "PEY",
    ]);
  });

  it("conserve les habilitations actuelles si aucun ajout", () => {
    expect(mergerHabilitations(["GIC"], [])).toEqual(["GIC"]);
  });

  it("ignore les chaînes vides après trim", () => {
    expect(mergerHabilitations(["GIC"], ["  ", ""])).toEqual(["GIC"]);
  });

  it("trim chaque préfixe ajouté", () => {
    expect(mergerHabilitations([], [" GIC ", "BAD"])).toEqual(["BAD", "GIC"]);
  });
});

describe("computeAgentProposals", () => {
  const j = (iso: string) => new Date(iso);

  it("aucun codeJs tenu → aucune proposition", () => {
    expect(computeAgentProposals([], [])).toEqual([]);
  });

  it("agent sans habilitation + codes tenus → tous proposés", () => {
    const tenus: CodeJsTenu[] = [
      { codeJs: "GIC015", nbJoursTenus: 5, dernierJour: j("2026-04-10") },
      { codeJs: "BAD020", nbJoursTenus: 3, dernierJour: j("2026-04-12") },
    ];
    const res = computeAgentProposals([], tenus);
    expect(res).toEqual([
      { codeJs: "BAD020", nbJoursTenus: 3, dernierJour: j("2026-04-12") },
      { codeJs: "GIC015", nbJoursTenus: 5, dernierJour: j("2026-04-10") },
    ]);
  });

  it("préfixe large couvre code spécifique → pas de proposition", () => {
    const tenus: CodeJsTenu[] = [
      { codeJs: "GIC015", nbJoursTenus: 5, dernierJour: j("2026-04-10") },
    ];
    expect(computeAgentProposals(["GIC"], tenus)).toEqual([]);
  });

  it("préfixe actuel spécifique ne couvre pas un autre code → propose l'autre", () => {
    const tenus: CodeJsTenu[] = [
      { codeJs: "GIC015", nbJoursTenus: 3, dernierJour: j("2026-04-10") },
      { codeJs: "GIC020", nbJoursTenus: 2, dernierJour: j("2026-04-11") },
    ];
    expect(computeAgentProposals(["GIC015"], tenus)).toEqual([
      { codeJs: "GIC020", nbJoursTenus: 2, dernierJour: j("2026-04-11") },
    ]);
  });

  it("mix couvert / non couvert → ne propose que les non couverts", () => {
    const tenus: CodeJsTenu[] = [
      { codeJs: "GIC015", nbJoursTenus: 5, dernierJour: j("2026-04-10") },
      { codeJs: "BAD020", nbJoursTenus: 2, dernierJour: j("2026-04-12") },
    ];
    expect(computeAgentProposals(["GIC"], tenus)).toEqual([
      { codeJs: "BAD020", nbJoursTenus: 2, dernierJour: j("2026-04-12") },
    ]);
  });

  it("résultat trié par codeJs croissant", () => {
    const tenus: CodeJsTenu[] = [
      { codeJs: "ZEB001", nbJoursTenus: 1, dernierJour: j("2026-04-01") },
      { codeJs: "AAA001", nbJoursTenus: 1, dernierJour: j("2026-04-01") },
      { codeJs: "MMM001", nbJoursTenus: 1, dernierJour: j("2026-04-01") },
    ];
    const res = computeAgentProposals([], tenus);
    expect(res.map((p) => p.codeJs)).toEqual(["AAA001", "MMM001", "ZEB001"]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run : `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npm test -- habilitationProposals`
Expected : échec — le module `@/services/habilitation-proposals.service` n'existe pas encore.

- [ ] **Step 3: Créer le service avec l'implémentation minimale**

Créer `src/services/habilitation-proposals.service.ts` avec exactement ce contenu :

```ts
/**
 * Service de propositions d'habilitations (préfixes JS) après import planning.
 *
 * Principe : pour chaque agent, lister les `codeJs` qu'il a tenus (historique complet,
 * hors NPO) qui ne sont couverts par AUCUN de ses préfixes actuels, puis proposer
 * chaque code tel quel (le plus restrictif possible).
 *
 * Logique idempotente : valider un ajout le fait disparaître des propositions suivantes.
 */
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CodeJsTenu {
  codeJs: string;
  nbJoursTenus: number;
  dernierJour: Date;
}

export interface HabilitationProposal extends CodeJsTenu {}

export interface AgentProposals {
  agentId: string;
  matricule: string;
  nom: string;
  prenom: string;
  habilitationsActuelles: string[];
  propositions: HabilitationProposal[];
}

export interface ValidationInput {
  agentId: string;
  prefixesAAjouter: string[];
}

export interface ValidationResult {
  agentsMisAJour: number;
  prefixesAjoutes: number;
  erreurs: Array<{ agentId: string; message: string }>;
}

// ─── Helpers purs ─────────────────────────────────────────────────────────────

/** Un code est couvert s'il commence par au moins un des préfixes. */
export function isCouvert(codeJs: string, prefixes: string[]): boolean {
  return prefixes.some((p) => p.length > 0 && codeJs.startsWith(p));
}

/** Union dédoublonnée + trim + tri alphabétique. */
export function mergerHabilitations(actuel: string[], ajouts: string[]): string[] {
  const cleaned = [...actuel, ...ajouts]
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
}

/**
 * Calcule les propositions pour un agent donné (logique pure, testable sans DB).
 * Retourne la liste triée par `codeJs` croissant.
 */
export function computeAgentProposals(
  habilitationsActuelles: string[],
  codesJsTenus: CodeJsTenu[],
): HabilitationProposal[] {
  return codesJsTenus
    .filter((c) => !isCouvert(c.codeJs, habilitationsActuelles))
    .sort((a, b) => a.codeJs.localeCompare(b.codeJs));
}
```

- [ ] **Step 4: Relancer les tests — ils doivent tous passer**

Run : `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npm test -- habilitationProposals`
Expected : 15 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/PC/Desktop/Point RH/point-rh"
git add src/services/habilitation-proposals.service.ts src/__tests__/habilitationProposals.test.ts
git commit -m "feat(habilitations): pure helpers for auto-proposal logic

Tests couvrent isCouvert, mergerHabilitations, computeAgentProposals
avec tous les cas du spec (préfixe large, préfixe strict, aucune
habilitation, code non couvert, tri alphabétique)."
```

---

## Task 3 — Fonction DB `calculerPropositionsHabilitations`

**Files:**
- Modify: `src/services/habilitation-proposals.service.ts`

- [ ] **Step 1: Ajouter la fonction DB**

À la fin de `src/services/habilitation-proposals.service.ts`, ajouter :

```ts
// ─── Accès DB ─────────────────────────────────────────────────────────────────

/**
 * Calcule toutes les propositions d'habilitations à partir de l'historique
 * complet de PlanningLigne. Retourne uniquement les agents AYANT au moins
 * une proposition (les autres sont filtrés).
 */
export async function calculerPropositionsHabilitations(): Promise<AgentProposals[]> {
  // 1. Agents actifs (non soft-deleted)
  const agents = await prisma.agent.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      matricule: true,
      nom: true,
      prenom: true,
      habilitations: true,
    },
  });

  // 2. Aggregation SQL : (agentId, codeJs) → COUNT + MAX(jourPlanning)
  //    Filtre : jsNpo = "JS" (exclut NPO) + codeJs non null/vide.
  const rows = await prisma.planningLigne.groupBy({
    by: ["agentId", "codeJs"],
    where: {
      agentId: { not: null },
      jsNpo: "JS",
      codeJs: { not: null },
    },
    _count: { _all: true },
    _max: { jourPlanning: true },
  });

  // 3. Indexation par agentId pour accès O(1)
  const byAgent = new Map<string, CodeJsTenu[]>();
  for (const row of rows) {
    if (!row.agentId || !row.codeJs) continue;
    const code = row.codeJs.trim();
    if (code.length === 0) continue;
    const tenu: CodeJsTenu = {
      codeJs: code,
      nbJoursTenus: row._count._all,
      dernierJour: row._max.jourPlanning ?? new Date(0),
    };
    const list = byAgent.get(row.agentId) ?? [];
    list.push(tenu);
    byAgent.set(row.agentId, list);
  }

  // 4. Calcul par agent → garder ceux avec ≥ 1 proposition
  const result: AgentProposals[] = [];
  for (const agent of agents) {
    const actuelles = parseHabilitations(agent.habilitations);
    const tenus = byAgent.get(agent.id) ?? [];
    const propositions = computeAgentProposals(actuelles, tenus);
    if (propositions.length === 0) continue;
    result.push({
      agentId: agent.id,
      matricule: agent.matricule,
      nom: agent.nom,
      prenom: agent.prenom,
      habilitationsActuelles: actuelles,
      propositions,
    });
  }

  // 5. Tri par nom, prenom
  result.sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
  return result;
}

/** Parse le JSON d'habilitations avec fallback vide en cas de corruption. */
function parseHabilitations(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run : `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npx tsc --noEmit`
Expected : 0 error.

- [ ] **Step 3: Vérifier que les tests existants passent toujours**

Run : `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npm test -- habilitationProposals`
Expected : 15 tests pass.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/PC/Desktop/Point RH/point-rh"
git add src/services/habilitation-proposals.service.ts
git commit -m "feat(habilitations): DB function calculerPropositionsHabilitations

groupBy (agentId, codeJs) sur PlanningLigne (hors NPO) + jointure avec
Agent pour renvoyer uniquement les agents avec au moins une proposition.
Tri par (nom, prenom). Parse safe des habilitations JSON."
```

---

## Task 4 — Fonction DB `validerPropositions`

**Files:**
- Modify: `src/services/habilitation-proposals.service.ts`

- [ ] **Step 1: Ajouter la fonction de validation**

À la fin de `src/services/habilitation-proposals.service.ts`, ajouter :

```ts
/**
 * Valide un lot de propositions : pour chaque agent, re-lit les habilitations
 * fraîches depuis la base, merge avec les ajouts, sauvegarde + audit log.
 * Les erreurs par agent (non bloquantes) sont accumulées dans `erreurs`.
 */
export async function validerPropositions(
  validations: ValidationInput[],
  actor: { id: string; email: string } | null,
): Promise<ValidationResult> {
  const result: ValidationResult = {
    agentsMisAJour: 0,
    prefixesAjoutes: 0,
    erreurs: [],
  };

  for (const { agentId, prefixesAAjouter } of validations) {
    try {
      // Filtrage des préfixes vides en amont
      const cleaned = prefixesAAjouter
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (cleaned.length === 0) continue;

      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
        select: { id: true, habilitations: true, deletedAt: true },
      });

      if (!agent) {
        result.erreurs.push({ agentId, message: "Agent introuvable." });
        continue;
      }
      if (agent.deletedAt !== null) {
        result.erreurs.push({ agentId, message: "Agent supprimé." });
        continue;
      }

      const actuelles = parseHabilitations(agent.habilitations);
      const nouvelles = mergerHabilitations(actuelles, cleaned);
      const ajoutesEffectivement = nouvelles.filter((p) => !actuelles.includes(p));
      if (ajoutesEffectivement.length === 0) continue; // tout déjà présent

      await prisma.agent.update({
        where: { id: agentId },
        data: { habilitations: JSON.stringify(nouvelles) },
      });

      await logAudit("HABILITATION_AUTO_VALIDATED", "Agent", {
        user: actor ? { id: actor.id, email: actor.email, role: "ADMIN", name: "" } : null,
        entityId: agentId,
        details: {
          prefixesAjoutes: ajoutesEffectivement,
          habilitationsApres: nouvelles,
          source: "import-proposal",
        },
      });

      result.agentsMisAJour += 1;
      result.prefixesAjoutes += ajoutesEffectivement.length;
    } catch (err) {
      result.erreurs.push({
        agentId,
        message: err instanceof Error ? err.message : "Erreur inconnue.",
      });
    }
  }

  return result;
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run : `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npx tsc --noEmit`
Expected : 0 error.

Note : si l'appel à `logAudit` signale une incompatibilité sur `role`/`name`, ouvrir `src/lib/auth.ts` pour inspecter la shape exacte de `TokenPayload` et ajuster les champs requis (nom, rôle) dans l'objet passé. Ne pas ajouter de `any`.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/PC/Desktop/Point RH/point-rh"
git add src/services/habilitation-proposals.service.ts
git commit -m "feat(habilitations): DB function validerPropositions + audit

Pour chaque validation : relecture fraîche des habilitations, merge,
update, logAudit. Les erreurs par agent sont non-bloquantes (accumulées
dans erreurs[])."
```

---

## Task 5 — Endpoint `GET /api/habilitations/propositions`

**Files:**
- Create: `src/app/api/habilitations/propositions/route.ts`

- [ ] **Step 1: Créer le fichier route**

Créer `src/app/api/habilitations/propositions/route.ts` avec exactement ce contenu :

```ts
/**
 * GET /api/habilitations/propositions — propositions d'habilitations (admin only).
 * Calcule à la demande à partir de l'historique PlanningLigne.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/session";
import { calculerPropositionsHabilitations } from "@/services/habilitation-proposals.service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const agents = await calculerPropositionsHabilitations();
    const totalPropositions = agents.reduce((sum, a) => sum + a.propositions.length, 0);
    return NextResponse.json({
      agents,
      totalAgents: agents.length,
      totalPropositions,
    });
  } catch (err) {
    console.error("[API/habilitations/propositions GET]", err);
    return NextResponse.json(
      { error: "Erreur lors du calcul des propositions." },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Vérifier la compilation**

Run : `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npx tsc --noEmit`
Expected : 0 error.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/PC/Desktop/Point RH/point-rh"
git add src/app/api/habilitations/propositions/route.ts
git commit -m "feat(api): GET /api/habilitations/propositions (admin only)

Renvoie la liste des agents avec au moins une proposition, calculée
à partir de l'historique PlanningLigne (hors NPO)."
```

---

## Task 6 — Endpoint `POST /api/habilitations/propositions/valider`

**Files:**
- Create: `src/app/api/habilitations/propositions/valider/route.ts`

- [ ] **Step 1: Créer le fichier route**

Créer `src/app/api/habilitations/propositions/valider/route.ts` avec exactement ce contenu :

```ts
/**
 * POST /api/habilitations/propositions/valider
 * Valide un lot de propositions d'habilitations (admin only, rate-limité).
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";
import {
  validerPropositions,
  type ValidationInput,
} from "@/services/habilitation-proposals.service";

export const runtime = "nodejs";

const HABILITATION_RATE_LIMIT = { max: 10, windowMs: 60 * 1000 };

interface Body {
  validations?: unknown;
}

export async function POST(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const rl = rateLimit("habilitationValidation", auth.user.id, HABILITATION_RATE_LIMIT);
  if (!rl.ok) {
    const retryAfterSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Trop de validations lancées. Réessayez dans une minute." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const validations = parseValidations(body.validations);
  if (validations === null) {
    return NextResponse.json(
      { error: "Format invalide : `validations` doit être un tableau de { agentId, prefixesAAjouter[] }." },
      { status: 400 },
    );
  }

  try {
    const result = await validerPropositions(validations, {
      id: auth.user.id,
      email: auth.user.email,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[API/habilitations/propositions/valider]", err);
    return NextResponse.json(
      { error: "Erreur lors de la validation des propositions." },
      { status: 500 },
    );
  }
}

function parseValidations(raw: unknown): ValidationInput[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ValidationInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const { agentId, prefixesAAjouter } = item as Record<string, unknown>;
    if (typeof agentId !== "string" || agentId.length === 0) return null;
    if (!Array.isArray(prefixesAAjouter)) return null;
    if (!prefixesAAjouter.every((p) => typeof p === "string")) return null;
    out.push({ agentId, prefixesAAjouter });
  }
  return out;
}
```

- [ ] **Step 2: Vérifier la compilation**

Run : `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npx tsc --noEmit`
Expected : 0 error.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/PC/Desktop/Point RH/point-rh"
git add src/app/api/habilitations/propositions/valider/route.ts
git commit -m "feat(api): POST /api/habilitations/propositions/valider

Admin only, rate-limité (10/min). Valide le schéma en entrée, délègue
à validerPropositions, renvoie { agentsMisAJour, prefixesAjoutes, erreurs }."
```

---

## Task 7 — Composant `HabilitationsProposalsPanel`

**Files:**
- Create: `src/components/import/HabilitationsProposalsPanel.tsx`

- [ ] **Step 1: Créer le composant**

Créer `src/components/import/HabilitationsProposalsPanel.tsx` avec exactement ce contenu :

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";

interface Proposal {
  codeJs: string;
  nbJoursTenus: number;
  dernierJour: string; // ISO
}

interface AgentProposals {
  agentId: string;
  matricule: string;
  nom: string;
  prenom: string;
  habilitationsActuelles: string[];
  propositions: Proposal[];
}

interface ApiResponse {
  agents: AgentProposals[];
  totalAgents: number;
  totalPropositions: number;
}

type Phase =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; data: ApiResponse };

export default function HabilitationsProposalsPanel() {
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{ agents: number; prefixes: number } | null>(null);
  const [search, setSearch] = useState("");

  // ── Fetch initial ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/habilitations/propositions");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setPhase({
              status: "error",
              message: body?.error ?? `HTTP ${res.status}`,
            });
          }
          return;
        }
        const data: ApiResponse = await res.json();
        if (cancelled) return;
        if (data.totalPropositions === 0) {
          setPhase({ status: "empty" });
          return;
        }
        // Cases cochées par défaut (optimiste)
        const initialChecked: Record<string, boolean> = {};
        for (const a of data.agents) {
          for (const p of a.propositions) {
            initialChecked[key(a.agentId, p.codeJs)] = true;
          }
        }
        setChecked(initialChecked);
        setPhase({ status: "ready", data });
      } catch (err) {
        if (!cancelled) {
          setPhase({
            status: "error",
            message: err instanceof Error ? err.message : "Erreur réseau.",
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Agents filtrés par recherche ──────────────────────────────────────────
  const filteredAgents = useMemo(() => {
    if (phase.status !== "ready") return [];
    const q = search.trim().toLowerCase();
    if (!q) return phase.data.agents;
    return phase.data.agents.filter(
      (a) =>
        a.nom.toLowerCase().includes(q) ||
        a.prenom.toLowerCase().includes(q) ||
        a.matricule.toLowerCase().includes(q),
    );
  }, [phase, search]);

  // ── Compteurs ──────────────────────────────────────────────────────────────
  const totalChecked = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked],
  );

  // ── Actions ────────────────────────────────────────────────────────────────
  function toggleOne(agentId: string, codeJs: string) {
    setChecked((prev) => ({ ...prev, [key(agentId, codeJs)]: !prev[key(agentId, codeJs)] }));
  }

  function setAllVisible(value: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const a of filteredAgents) {
        for (const p of a.propositions) {
          next[key(a.agentId, p.codeJs)] = value;
        }
      }
      return next;
    });
  }

  async function submit() {
    if (phase.status !== "ready") return;
    setSubmitError(null);
    setSubmitSuccess(null);

    const validations = phase.data.agents
      .map((a) => ({
        agentId: a.agentId,
        prefixesAAjouter: a.propositions
          .filter((p) => checked[key(a.agentId, p.codeJs)])
          .map((p) => p.codeJs),
      }))
      .filter((v) => v.prefixesAAjouter.length > 0);

    if (validations.length === 0) {
      setSubmitError("Aucune proposition sélectionnée.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/habilitations/propositions/valider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validations }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        setSubmitError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      setSubmitSuccess({ agents: body.agentsMisAJour, prefixes: body.prefixesAjoutes });
      // Retirer les propositions validées : re-fetch pour refléter l'état réel
      const refetch = await fetch("/api/habilitations/propositions");
      if (refetch.ok) {
        const newData: ApiResponse = await refetch.json();
        if (newData.totalPropositions === 0) {
          setPhase({ status: "empty" });
        } else {
          const initialChecked: Record<string, boolean> = {};
          for (const a of newData.agents) {
            for (const p of a.propositions) {
              initialChecked[key(a.agentId, p.codeJs)] = true;
            }
          }
          setChecked(initialChecked);
          setPhase({ status: "ready", data: newData });
        }
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur réseau.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────
  if (phase.status === "loading") {
    return (
      <div className="mt-6 rounded-xl p-5 border bg-white border-gray-200 text-sm text-gray-500">
        Calcul des propositions d&apos;habilitations…
      </div>
    );
  }

  if (phase.status === "error") {
    return (
      <div className="mt-6 rounded-xl p-5 border bg-red-50 border-red-200 text-sm text-red-800">
        Impossible de charger les propositions : {phase.message}
      </div>
    );
  }

  if (phase.status === "empty") {
    return (
      <div className="mt-6 rounded-xl p-5 border bg-green-50 border-green-200 text-sm text-green-800">
        ✓ Aucune habilitation à ajuster — toutes les JS tenues sont déjà couvertes.
      </div>
    );
  }

  const { agents, totalAgents, totalPropositions } = phase.data;
  const showSearch = totalAgents >= 20;

  return (
    <div className="mt-6 rounded-xl p-5 border bg-white border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Habilitations proposées</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {totalAgents} agent{totalAgents > 1 ? "s" : ""} — {totalPropositions} préfixe{totalPropositions > 1 ? "s" : ""} à examiner
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAllVisible(true)}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            disabled={submitting}
          >
            Tout sélectionner
          </button>
          <button
            type="button"
            onClick={() => setAllVisible(false)}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            disabled={submitting}
          >
            Tout désélectionner
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || totalChecked === 0}
            className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg"
          >
            {submitting ? "Validation…" : `Valider (${totalChecked})`}
          </button>
        </div>
      </div>

      {submitError && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-800">
          {submitError}
        </div>
      )}
      {submitSuccess && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs bg-green-50 border border-green-200 text-green-800">
          ✓ {submitSuccess.agents} agent{submitSuccess.agents > 1 ? "s" : ""} mis à jour, {submitSuccess.prefixes} préfixe{submitSuccess.prefixes > 1 ? "s" : ""} ajouté{submitSuccess.prefixes > 1 ? "s" : ""}.
        </div>
      )}

      {showSearch && (
        <input
          type="text"
          placeholder="Rechercher par nom, prénom, matricule…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full mb-3 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      <div className="space-y-4">
        {filteredAgents.map((a) => (
          <div key={a.agentId} className="border border-gray-100 rounded-lg p-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <span className="font-medium text-gray-900">{a.nom} {a.prenom}</span>
                <span className="ml-2 font-mono text-xs text-gray-400">{a.matricule}</span>
              </div>
              <div className="text-xs text-gray-500">
                Actuelles :{" "}
                {a.habilitationsActuelles.length === 0
                  ? <span className="italic">aucune</span>
                  : a.habilitationsActuelles.join(", ")}
              </div>
            </div>
            <ul className="mt-2 space-y-1">
              {a.propositions.map((p) => (
                <li key={p.codeJs} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={!!checked[key(a.agentId, p.codeJs)]}
                    onChange={() => toggleOne(a.agentId, p.codeJs)}
                    disabled={submitting}
                    className="h-4 w-4"
                  />
                  <span className="font-mono font-medium text-blue-700">{p.codeJs}</span>
                  <span className="text-xs text-gray-500">
                    {p.nbJoursTenus} jour{p.nbJoursTenus > 1 ? "s" : ""}, dernier le{" "}
                    {formatDateFr(p.dernierJour)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function key(agentId: string, codeJs: string) {
  return `${agentId}|${codeJs}`;
}

function formatDateFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
```

- [ ] **Step 2: Vérifier la compilation**

Run : `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npx tsc --noEmit`
Expected : 0 error.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/PC/Desktop/Point RH/point-rh"
git add src/components/import/HabilitationsProposalsPanel.tsx
git commit -m "feat(ui): HabilitationsProposalsPanel — review + validation

Fetch auto au montage, cases cochées par défaut, boutons tout/rien,
compteur 'Valider (N)', recherche si ≥ 20 agents, re-fetch après
validation pour refléter l'état réel."
```

---

## Task 8 — Intégration dans `ImportForm` + prop `isAdmin`

**Files:**
- Modify: `src/components/import/ImportForm.tsx`
- Modify: `src/app/import/page.tsx`

- [ ] **Step 1: Faire accepter `isAdmin` à `ImportForm`**

Ouvrir `src/components/import/ImportForm.tsx`.

Remplacer l'en-tête de composant :

```tsx
export default function ImportForm() {
```

par :

```tsx
interface Props {
  isAdmin: boolean;
}

export default function ImportForm({ isAdmin }: Props) {
```

- [ ] **Step 2: Importer le panneau et l'afficher sous `ImportResultMessage`**

En haut de `src/components/import/ImportForm.tsx`, ajouter l'import :

```tsx
import HabilitationsProposalsPanel from "./HabilitationsProposalsPanel";
```

Puis, à la fin du JSX (juste sous `{result && <ImportResultMessage result={result} />}`), ajouter :

```tsx
{result?.success && isAdmin && <HabilitationsProposalsPanel />}
```

- [ ] **Step 3: Charger la session et passer `isAdmin` depuis `page.tsx`**

Ouvrir `src/app/import/page.tsx`.

Remplacer en haut du fichier l'import existant d'`ImportForm` et ajouter les imports nécessaires :

```tsx
import ImportForm from "@/components/import/ImportForm";
```

par :

```tsx
import ImportForm from "@/components/import/ImportForm";
import { getSession } from "@/lib/session";
```

Puis remplacer la signature :

```tsx
export default async function ImportPage() {
  return (
```

par :

```tsx
export default async function ImportPage() {
  const session = await getSession();
  const isAdmin = session?.role === "ADMIN";
  return (
```

Enfin, remplacer la balise :

```tsx
            <ImportForm />
```

par :

```tsx
            <ImportForm isAdmin={isAdmin} />
```

- [ ] **Step 4: Vérifier la compilation**

Run : `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npx tsc --noEmit`
Expected : 0 error.

- [ ] **Step 5: Vérifier que les tests existants passent toujours**

Run : `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npm test`
Expected : tous les tests passent.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/PC/Desktop/Point RH/point-rh"
git add src/components/import/ImportForm.tsx src/app/import/page.tsx
git commit -m "feat(import): wire HabilitationsProposalsPanel under result

ImportPage charge la session, passe isAdmin à ImportForm.
Le panneau ne s'affiche que si result.success && isAdmin."
```

---

## Task 9 — Vérification manuelle via preview

**Files:** aucun (vérification seulement).

- [ ] **Step 1: Démarrer le dev server**

Utiliser `preview_start` avec le nom `"Next.js Dev"` (défini dans `.claude/launch.json` à la racine `C:/Users/PC/Desktop/Point RH/`).

- [ ] **Step 2: Vérifier les logs serveur**

Utiliser `preview_logs` avec `level: "error"`. Expected : aucune erreur de compilation.

- [ ] **Step 3: Se connecter en admin**

Ouvrir `http://localhost:3001/auth/login`. Se connecter avec les identifiants admin (seed : `admin@point-rh.local` / `Admin1234!` si base neuve).

- [ ] **Step 4: Importer un fichier planning**

Sur `http://localhost:3001/import`, uploader un fichier planning test (un `.xlsx` ou `.txt` au format SNCF avec au moins 10 agents et plusieurs `codeJs` distincts).

- [ ] **Step 5: Vérifier le panneau**

Après succès de l'import :
- Le panneau "Habilitations proposées" doit apparaître sous `ImportResultMessage`.
- Les agents listés doivent avoir leurs habilitations actuelles affichées + au moins une proposition cochée.
- `[Tout désélectionner]` met le compteur `Valider (N)` à 0.
- `[Tout sélectionner]` remet le compteur au maximum.
- Décocher une proposition individuelle diminue le compteur de 1.

- [ ] **Step 6: Valider les propositions**

Cliquer `[Valider (N)]` avec au moins une case cochée.
Expected :
- Message vert `✓ X agents mis à jour, Y préfixes ajoutés.`
- Les propositions validées disparaissent du panneau (re-fetch).
- Si toutes les propositions ont été validées → message "Aucune habilitation à ajuster".

- [ ] **Step 7: Vérifier en base**

Via `/admin/habilitations`, vérifier que les agents validés ont bien les nouveaux préfixes dans leur liste d'habilitations.

- [ ] **Step 8: Tester l'accès non-admin**

Se déconnecter, se reconnecter avec un compte USER (non-admin). Refaire un import. Expected : le panneau n'apparaît PAS (condition `isAdmin` en `ImportForm`).

- [ ] **Step 9: Tester l'accès direct à l'API en non-admin**

Dans l'onglet Network du navigateur, tenter `GET /api/habilitations/propositions` avec une session USER.
Expected : HTTP 403 avec `{ "error": "Accès refusé. Droits administrateur requis." }`.

- [ ] **Step 10: Arrêter le dev server**

Utiliser `preview_stop`.

---

## Commandes récapitulatives

| Commande | Usage |
|---|---|
| `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npm test` | Lancer tous les tests unitaires |
| `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npm test -- habilitationProposals` | Lancer uniquement les tests de ce plan |
| `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npx tsc --noEmit` | Vérification TypeScript globale |
| `cd "C:/Users/PC/Desktop/Point RH/point-rh" && npm run lint` | Linter ESLint |

---

## Notes d'implémentation

- **Pas de mock Prisma** : le codebase n'utilise pas de mocks prisma dans les tests. Les tests unitaires ciblent uniquement les fonctions pures. Les fonctions DB sont vérifiées à la main via la Task 9.
- **Pas de migration** : les champs utilisés (`Agent.habilitations`, `PlanningLigne.codeJs`, `PlanningLigne.jsNpo`, `PlanningLigne.jourPlanning`, `Agent.deletedAt`) existent déjà dans `prisma/schema.prisma`.
- **Encodage d'habilitations** : stocké en JSON stringifié (ex: `'["GIC","BAD"]'`). Le parse est robuste (fallback `[]` si corruption).
- **Rate limit séparé** : namespace `"habilitationValidation"` distinct des imports, pour ne pas se bloquer mutuellement.
- **Idempotence** : valider deux fois la même proposition ne crée pas de doublon (merge + `Set`) et ne compte qu'une fois (`ajoutesEffectivement` ne retient que les nouvelles valeurs absentes de `actuelles`).

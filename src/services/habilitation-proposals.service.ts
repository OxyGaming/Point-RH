/**
 * Service de propositions d'habilitations (préfixes JS) après import planning.
 *
 * Principe : pour chaque agent, lister les `codeJs` qu'il a tenus (historique complet,
 * hors NPO et hors JS sans charge réelle) qui ne sont couverts par AUCUN de ses
 * préfixes actuels, puis proposer chaque code tel quel (le plus restrictif possible).
 *
 * Les JS Z (suffixe " Z", préfixe "FO", typeJs="DIS", préfixes ZeroLoadPrefix admin)
 * sont exclues : un agent placé sur une JS sans charge n'y a pas vraiment "tenu" le code,
 * ça génère du bruit d'inviter à l'habiliter dessus.
 *
 * Logique idempotente : valider un ajout le fait disparaître des propositions suivantes.
 */
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";
import { isZeroLoadJs } from "@/lib/simulation/jsUtils";
import { loadZeroLoadPrefixes } from "@/lib/simulation/zeroLoadPrefixLoader";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CodeJsTenu {
  codeJs: string;
  nbJoursTenus: number;
  dernierJour: Date;
}

export type HabilitationProposal = CodeJsTenu;

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

  // 2. Aggregation SQL : (agentId, codeJs, typeJs) → COUNT + MAX(jourPlanning)
  //    Filtres SQL :
  //      - jsNpo = "JS"            (exclut NPO)
  //      - codeJs non null/vide
  //      - codeJs ne commence PAS par "FO" et ne se termine PAS par " Z"
  //        (built-in JS Z déjà exclues côté SQL pour réduire le volume)
  //    Le filtrage final (typeJs="DIS" + préfixes admin ZeroLoadPrefix) se fait
  //    après le groupBy via isZeroLoadJs() — option 3 : SQL pré-filtre + JS post-filtre.
  const zeroLoadPrefixes = await loadZeroLoadPrefixes();
  const rows = await prisma.planningLigne.groupBy({
    by: ["agentId", "codeJs", "typeJs"],
    where: {
      agentId: { not: null },
      jsNpo: "JS",
      codeJs: { not: null },
      NOT: [
        { codeJs: { startsWith: "FO" } },
        { codeJs: { endsWith: " Z" } },
      ],
    },
    _count: { _all: true },
    _max: { jourPlanning: true },
  });

  // 3. Indexation par agentId pour accès O(1)
  //    Filtrage final via isZeroLoadJs (typeJs="DIS" + préfixes admin),
  //    puis reconsolidation par (agentId, codeJs) car le groupBy par typeJs peut
  //    dédoubler les lignes pour un même code (typeJs variant entre jours).
  const consolide = new Map<string, Map<string, CodeJsTenu>>();
  for (const row of rows) {
    if (!row.agentId || !row.codeJs) continue;
    const code = row.codeJs.trim();
    if (code.length === 0) continue;
    if (isZeroLoadJs(code, row.typeJs, zeroLoadPrefixes)) continue;

    const codeMap = consolide.get(row.agentId) ?? new Map<string, CodeJsTenu>();
    const existing = codeMap.get(code);
    const dernierJour = row._max.jourPlanning ?? new Date(0);
    codeMap.set(code, {
      codeJs: code,
      nbJoursTenus: (existing?.nbJoursTenus ?? 0) + row._count._all,
      dernierJour:
        existing && existing.dernierJour > dernierJour ? existing.dernierJour : dernierJour,
    });
    consolide.set(row.agentId, codeMap);
  }

  const byAgent = new Map<string, CodeJsTenu[]>();
  for (const [agentId, codeMap] of consolide) {
    byAgent.set(agentId, Array.from(codeMap.values()));
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

/**
 * Valide un lot de propositions : pour chaque agent, re-lit les habilitations
 * fraîches depuis la base, merge avec les ajouts, sauvegarde + audit log.
 * Les erreurs par agent (non bloquantes) sont accumulées dans `erreurs`.
 */
export async function validerPropositions(
  validations: ValidationInput[],
  actor: SessionUser | null,
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
        user: actor,
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

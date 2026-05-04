/**
 * Service de propositions d'habilitations (préfixes JS) après import planning.
 *
 * Deux logiques symétriques, basées sur l'historique complet de PlanningLigne
 * (hors NPO, hors JS sans charge réelle) :
 *
 *   – AJOUTS    : pour chaque codeJs tenu non couvert par les habilitations
 *                  actuelles → proposer d'ajouter le code tel quel (le plus
 *                  restrictif possible).
 *   – SUPPRESSIONS : pour chaque préfixe d'habilitation actuel n'ayant
 *                     AUCUN match dans l'historique → proposer de le retirer.
 *
 * Les JS Z (suffixe " Z", préfixe "FO", typeJs="DIS", préfixes ZeroLoadPrefix admin)
 * sont exclues : un agent placé sur une JS sans charge n'y a pas vraiment "tenu" le code,
 * ça génère du bruit dans les deux sens.
 *
 * Logique idempotente : valider un ajout/suppression le fait disparaître des
 * propositions suivantes.
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
  /** Préfixes proposés à l'ajout (codes tenus non couverts). */
  propositions: HabilitationProposal[];
  /** Préfixes proposés à la suppression (aucun match dans l'historique). */
  suppressions: string[];
}

export interface ValidationInput {
  agentId: string;
  prefixesAAjouter: string[];
  /** Préfixes à retirer des habilitations actuelles. Optionnel pour rétro-compat. */
  prefixesARetirer?: string[];
}

export interface ValidationResult {
  agentsMisAJour: number;
  prefixesAjoutes: number;
  prefixesRetires: number;
  erreurs: Array<{ agentId: string; message: string }>;
}

// ─── Helpers purs ─────────────────────────────────────────────────────────────

/** Un code est couvert s'il commence par au moins un des préfixes. */
export function isCouvert(codeJs: string, prefixes: string[]): boolean {
  return prefixes.some((p) => p.length > 0 && codeJs.startsWith(p));
}

/**
 * Préfixes / suffixes des codes JS exclus des PROPOSITIONS D'AJOUT
 * (audience, IP, véhicules de manœuvre, codes terminant par "/").
 * N'impacte ni la simulation ni les suppressions : un agent peut conserver
 * ces préfixes en habilitation et continuer à les voir proposer au retrait.
 */
const PROPOSAL_EXCLUDED_PREFIXES = ["AUDIENC", "IP", "VM"] as const;
const PROPOSAL_EXCLUDED_SUFFIXES = ["/"] as const;

export function isExcluDesPropositions(codeJs: string): boolean {
  return (
    PROPOSAL_EXCLUDED_PREFIXES.some((p) => codeJs.startsWith(p)) ||
    PROPOSAL_EXCLUDED_SUFFIXES.some((s) => codeJs.endsWith(s))
  );
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
    .filter((c) => !isExcluDesPropositions(c.codeJs))
    .sort((a, b) => a.codeJs.localeCompare(b.codeJs));
}

/**
 * Calcule les habilitations qu'on peut proposer à la SUPPRESSION (logique pure).
 *
 * Critère : un préfixe est candidat au retrait s'il n'a strictement AUCUN match
 * dans la liste des codes tenus (un préfixe qui matche au moins un code reste
 * conservé, même couvert par un préfixe plus large — la déduplication des
 * habilitations redondantes est une autre concern).
 *
 * Retourne les préfixes triés alphabétiquement.
 */
export function computeAgentRemoveProposals(
  habilitationsActuelles: string[],
  codesJsTenus: CodeJsTenu[],
): string[] {
  const codes = codesJsTenus.map((c) => c.codeJs);
  return habilitationsActuelles
    .filter((p) => p.length > 0)
    .filter((p) => !codes.some((c) => c.startsWith(p)))
    .slice()
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Applique des suppressions à une liste d'habilitations, avec dédup et tri.
 * Idempotent : retirer un préfixe absent ne change rien.
 */
export function appliquerSuppressions(actuel: string[], retraits: string[]): string[] {
  const toRemove = new Set(retraits.map((p) => p.trim()).filter((p) => p.length > 0));
  return Array.from(new Set(actuel.map((p) => p.trim()).filter((p) => p.length > 0 && !toRemove.has(p))))
    .sort((a, b) => a.localeCompare(b));
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

  // 4. Calcul par agent → garder ceux avec ≥ 1 proposition (ajout OU suppression)
  const result: AgentProposals[] = [];
  for (const agent of agents) {
    const actuelles = parseHabilitations(agent.habilitations);
    const tenus = byAgent.get(agent.id) ?? [];
    const propositions = computeAgentProposals(actuelles, tenus);
    const suppressions = computeAgentRemoveProposals(actuelles, tenus);
    if (propositions.length === 0 && suppressions.length === 0) continue;
    result.push({
      agentId: agent.id,
      matricule: agent.matricule,
      nom: agent.nom,
      prenom: agent.prenom,
      habilitationsActuelles: actuelles,
      propositions,
      suppressions,
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
    prefixesRetires: 0,
    erreurs: [],
  };

  for (const { agentId, prefixesAAjouter, prefixesARetirer } of validations) {
    try {
      const cleanedAjouts = (prefixesAAjouter ?? [])
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      const cleanedRetraits = (prefixesARetirer ?? [])
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (cleanedAjouts.length === 0 && cleanedRetraits.length === 0) continue;

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
      // Application : retraits d'abord, puis ajouts (ordre sans incidence sur le résultat
      // mais cohérent : on nettoie puis on enrichit)
      const apresRetrait = appliquerSuppressions(actuelles, cleanedRetraits);
      const nouvelles = mergerHabilitations(apresRetrait, cleanedAjouts);

      const ajoutesEffectivement = nouvelles.filter((p) => !actuelles.includes(p));
      const retiresEffectivement = actuelles.filter((p) => !nouvelles.includes(p));
      if (ajoutesEffectivement.length === 0 && retiresEffectivement.length === 0) continue;

      await prisma.agent.update({
        where: { id: agentId },
        data: { habilitations: JSON.stringify(nouvelles) },
      });

      await logAudit("HABILITATION_AUTO_VALIDATED", "Agent", {
        user: actor,
        entityId: agentId,
        details: {
          prefixesAjoutes: ajoutesEffectivement,
          prefixesRetires: retiresEffectivement,
          habilitationsApres: nouvelles,
          source: "import-proposal",
        },
      });

      result.agentsMisAJour += 1;
      result.prefixesAjoutes += ajoutesEffectivement.length;
      result.prefixesRetires += retiresEffectivement.length;
    } catch (err) {
      result.erreurs.push({
        agentId,
        message: err instanceof Error ? err.message : "Erreur inconnue.",
      });
    }
  }

  return result;
}

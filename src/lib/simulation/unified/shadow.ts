/**
 * Mode shadow — exécute le solveur unifié EN PARALLÈLE de l'allocator legacy
 * pour comparer les sorties sur des cas réels, sans rien changer à l'UI.
 *
 * Pas de side-effect sur le scénario retourné. Émet un rapport structuré
 * (via logger + console.log lisible) qui répond aux 3 questions :
 *   1. Le solveur unifié trouve-t-il une solution complète ?
 *   2. Une séquence cible spécifique apparaît-elle parmi les solutions ?
 *      (ex: "CHENNOUF" → "BROUILLAT" → "LEGUAY")
 *   3. En quoi la solution unifiée diffère-t-elle du legacy ?
 *
 * Activation : variable d'env UNIFIED_SHADOW=1 (côté serveur).
 */

import type { JsCible } from "@/types/js-simulation";
import type { WorkRulesMinutes } from "@/lib/rules/workRules";
import type { LpaContext } from "@/types/deplacement";
import type { LogCollector } from "@/engine/logger";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { AffectationJs } from "@/types/multi-js-simulation";

import type {
  AgentCoverageIndex,
} from "@/lib/simulation/multiJs/chaineCache";
import { creerEtatInitial } from "./etat";
import { besoinRacineFromJs, enumererSolutions } from "./solveur";
import type {
  ConsequenceType,
  NiveauRisque,
  Solution,
} from "./types";

// ─── Types de rapport ────────────────────────────────────────────────────────

interface SolutionResume {
  n1Id: string;
  n1Nom: string;
  n1Prenom: string;
  profondeur: number;
  niveauRisque: NiveauRisque;
  /** Aplatissement post-ordre (feuilles puis racine), pour lecture séquentielle. */
  chaine: Array<{
    agentNom: string;
    agentPrenom: string;
    jsCode: string | null;
    jsDate: string;
    jsHoraires: string;
    consequenceType: ConsequenceType | "RACINE";
  }>;
}

export interface ShadowDiffParJs {
  jsId: string;
  jsCode: string | null;
  jsDate: string;
  jsHoraires: string;

  legacy: {
    agentRetenu: string | null;
    statut: string | null;
    nbCascadeModifs: number;
    cascadeAgents: string[];
    chaineMaillons: string[];
  };

  unified: {
    nbSolutions: number;
    budgetConsomme: number;
    raisonSiVide?: string;
    solutions: SolutionResume[];
  };

  diff: {
    /** L'agent N1 du legacy est-il aussi le N1 de la 1re solution unifiée ? */
    n1AgentMatch: boolean;
    /** unified trouve une solution alors que legacy n'a pas couvert. */
    unifiedTrouveLegacyEchoue: boolean;
    /** legacy a couvert mais unified ne trouve aucune solution. */
    legacyCouvreUnifiedEchoue: boolean;
    /**
     * Une solution unifiée contient EXACTEMENT la séquence cible (ordre des
     * agents dans la chaîne aplatie post-ordre). null si pas de cible définie.
     */
    sequenceCibleTrouvee: boolean | null;
  };
}

export interface ShadowReport {
  scenarioId: string;
  scenarioTitre: string;
  nbJsAnalysees: number;
  diffsParJs: ShadowDiffParJs[];
  agregat: {
    nbN1Match: number;
    nbUnifiedSeul: number;
    nbLegacySeul: number;
    nbSequenceCibleTrouvee: number;
    budgetTotal: number;
  };
}

// ─── Helpers d'aplatissement de Solution ─────────────────────────────────────

function aplatirSolutionPourLog(solution: Solution): SolutionResume {
  const chaine = solution.resolutionsAplaties.map((r, i) => ({
    agentNom: r.agent.nom,
    agentPrenom: r.agent.prenom,
    jsCode: r.besoin.jsCible.codeJs,
    jsDate: r.besoin.jsCible.date,
    jsHoraires: `${r.besoin.jsCible.heureDebut}–${r.besoin.jsCible.heureFin}`,
    consequenceType:
      r.besoin.origine.type === "RACINE"
        ? ("RACINE" as const)
        : r.besoin.origine.consequenceType,
  }));

  // Le N1 (l'agent qui prend l'imprévu racine) est la racine — donc le DERNIER
  // élément de l'aplatissement post-ordre.
  const racine = solution.resolutionsAplaties[solution.resolutionsAplaties.length - 1];

  return {
    n1Id: racine.agent.id,
    n1Nom: racine.agent.nom,
    n1Prenom: racine.agent.prenom,
    profondeur: solution.profondeurMax,
    niveauRisque: solution.niveauRisque,
    chaine,
  };
}

// ─── Détection séquence cible ────────────────────────────────────────────────

/**
 * Vérifie si une séquence d'agents (par leur nom) apparaît dans une solution.
 * Tolérant à la casse et à l'ordre N1→feuilles ou feuilles→N1.
 *
 * Exemple : `["CHENNOUF", "BROUILLAT", "LEGUAY"]` → true si une solution a
 * une chaîne aplatie qui contient ces 3 noms (peu importe l'ordre dans la chaîne).
 */
function solutionContientSequence(
  solution: Solution,
  sequenceNoms: readonly string[]
): boolean {
  if (sequenceNoms.length === 0) return false;
  const cibles = new Set(sequenceNoms.map((n) => n.toUpperCase()));
  const presents = new Set(
    solution.resolutionsAplaties.map((r) => r.agent.nom.toUpperCase())
  );
  for (const nom of cibles) if (!presents.has(nom)) return false;
  return true;
}

// ─── Construction d'un résumé legacy par JS ──────────────────────────────────

function resumeLegacy(
  jsId: string,
  affectations: ReadonlyMap<string, AffectationJs>
): ShadowDiffParJs["legacy"] {
  const aff = affectations.get(jsId);
  if (!aff) {
    return {
      agentRetenu: null,
      statut: null,
      nbCascadeModifs: 0,
      cascadeAgents: [],
      chaineMaillons: [],
    };
  }
  return {
    agentRetenu: `${aff.agentNom} ${aff.agentPrenom}`,
    statut: aff.statut,
    nbCascadeModifs: aff.cascadeModifications.length,
    cascadeAgents: aff.cascadeModifications.map(
      (m) => `${m.agentNom} ${m.agentPrenom}`
    ),
    chaineMaillons:
      aff.chaineRemplacement?.maillons.map(
        (m) => `${m.agentNom} ${m.agentPrenom}`
      ) ?? [],
  };
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

export interface RunShadowParams {
  scenarioId: string;
  scenarioTitre: string;
  jsCibles: readonly JsCible[];
  legacyAffectations: ReadonlyMap<string, AffectationJs>;

  // Contexte d'évaluation (mêmes inputs que le legacy)
  agentsMap: ReadonlyMap<string, AgentDataMultiJs>;
  index: AgentCoverageIndex;
  rules: WorkRulesMinutes;
  lpaContext?: LpaContext;
  npoExclusionCodes?: readonly string[];
  importId: string;
  remplacement: boolean;
  deplacement: boolean;

  // Paramétrage shadow
  /** Cap sur le nombre de solutions énumérées par JS. */
  maxSolutionsParJs?: number;
  /** Séquence cible à détecter (noms d'agents). null = pas de check. */
  sequenceCibleNoms?: readonly string[] | null;
}

export function runShadowComparison(params: RunShadowParams): ShadowReport {
  const maxSolutionsParJs = params.maxSolutionsParJs ?? 5;
  const sequenceCible = params.sequenceCibleNoms ?? null;

  const diffsParJs: ShadowDiffParJs[] = [];
  let budgetTotal = 0;

  for (const js of params.jsCibles) {
    const etat = creerEtatInitial({
      agentsMap: params.agentsMap,
      index: params.index,
      rules: params.rules,
      lpaContext: params.lpaContext,
      npoExclusionCodes: params.npoExclusionCodes,
      importId: params.importId,
      remplacement: params.remplacement,
      deplacement: params.deplacement,
    });

    const besoin = besoinRacineFromJs(js);
    let solutions: Solution[] = [];
    let raisonSiVide: string | undefined;
    try {
      solutions = enumererSolutions(besoin, etat, maxSolutionsParJs);
    } catch (err) {
      raisonSiVide = err instanceof Error ? err.message : "erreur inconnue";
    }
    if (solutions.length === 0 && !raisonSiVide) {
      raisonSiVide = "AUCUNE_SOLUTION";
    }

    budgetTotal += etat.budget.remaining < 0 ? 0 : (12000 - etat.budget.remaining);

    const resumes = solutions.map(aplatirSolutionPourLog);
    const legacy = resumeLegacy(js.planningLigneId, params.legacyAffectations);

    const n1AgentMatch =
      legacy.agentRetenu !== null &&
      resumes.length > 0 &&
      legacy.agentRetenu === `${resumes[0].n1Nom} ${resumes[0].n1Prenom}`;

    const unifiedTrouveLegacyEchoue =
      legacy.agentRetenu === null && resumes.length > 0;

    const legacyCouvreUnifiedEchoue =
      legacy.agentRetenu !== null && resumes.length === 0;

    const sequenceCibleTrouvee: boolean | null =
      sequenceCible === null
        ? null
        : solutions.some((s) => solutionContientSequence(s, sequenceCible));

    diffsParJs.push({
      jsId: js.planningLigneId,
      jsCode: js.codeJs,
      jsDate: js.date,
      jsHoraires: `${js.heureDebut}–${js.heureFin}`,
      legacy,
      unified: {
        nbSolutions: resumes.length,
        budgetConsomme: 12000 - etat.budget.remaining,
        raisonSiVide,
        solutions: resumes,
      },
      diff: {
        n1AgentMatch,
        unifiedTrouveLegacyEchoue,
        legacyCouvreUnifiedEchoue,
        sequenceCibleTrouvee,
      },
    });
  }

  const agregat = {
    nbN1Match: diffsParJs.filter((d) => d.diff.n1AgentMatch).length,
    nbUnifiedSeul: diffsParJs.filter((d) => d.diff.unifiedTrouveLegacyEchoue).length,
    nbLegacySeul: diffsParJs.filter((d) => d.diff.legacyCouvreUnifiedEchoue).length,
    nbSequenceCibleTrouvee: diffsParJs.filter(
      (d) => d.diff.sequenceCibleTrouvee === true
    ).length,
    budgetTotal,
  };

  return {
    scenarioId: params.scenarioId,
    scenarioTitre: params.scenarioTitre,
    nbJsAnalysees: diffsParJs.length,
    diffsParJs,
    agregat,
  };
}

// ─── Logging lisible ─────────────────────────────────────────────────────────

/**
 * Émet le rapport via le LogCollector + un console.log structuré pour
 * lecture dans `next dev` ou les logs serveur.
 */
export function emitShadowReport(report: ShadowReport, logger?: LogCollector): void {
  logger?.info("UNIFIED_SHADOW_REPORT", {
    data: {
      scenarioId: report.scenarioId,
      titre: report.scenarioTitre,
      nbJsAnalysees: report.nbJsAnalysees,
      agregat: report.agregat,
      diffsParJs: report.diffsParJs as unknown as Record<string, unknown>[],
    },
  });

  // Sortie console multi-ligne pour lecture humaine en dev
  // eslint-disable-next-line no-console
  console.log(
    `\n[UNIFIED_SHADOW] scénario "${report.scenarioTitre}" — ${report.nbJsAnalysees} JS analysées` +
      `\n  agrégat: ${JSON.stringify(report.agregat)}`
  );
  for (const d of report.diffsParJs) {
    // eslint-disable-next-line no-console
    console.log(
      `\n  ── JS ${d.jsCode ?? "?"} ${d.jsDate} ${d.jsHoraires}` +
        `\n     legacy: ${d.legacy.agentRetenu ?? "NON_COUVERT"} (statut=${d.legacy.statut ?? "—"}, cascade=${d.legacy.nbCascadeModifs}, chaîne=${d.legacy.chaineMaillons.length})` +
        `\n     unified: ${d.unified.nbSolutions} solution(s)${d.unified.raisonSiVide ? ` (raison: ${d.unified.raisonSiVide})` : ""} — budget=${d.unified.budgetConsomme}` +
        d.unified.solutions
          .map(
            (s, i) =>
              `\n       sol ${i + 1}: N1=${s.n1Nom} ${s.n1Prenom} profondeur=${s.profondeur} risque=${s.niveauRisque} chaîne=${s.chaine.map((c) => c.agentNom).join(" → ")}`
          )
          .join("") +
        `\n     diff: n1Match=${d.diff.n1AgentMatch} unifiedSeul=${d.diff.unifiedTrouveLegacyEchoue} legacySeul=${d.diff.legacyCouvreUnifiedEchoue}` +
        (d.diff.sequenceCibleTrouvee !== null
          ? ` séquenceCible=${d.diff.sequenceCibleTrouvee}`
          : "")
    );
  }
}

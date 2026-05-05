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

import {
  findEligibleAgentsForJs,
  type AgentCoverageIndex,
} from "@/lib/simulation/multiJs/chaineCache";
import { creerEtatInitial } from "./etat";
import { besoinRacineFromJs, enumererSolutions } from "./solveur";
import { evaluerImpactComplet } from "./evaluation";
import { scorerCandidatDetail } from "@/lib/simulation/scenarioScorer";
import type {
  Besoin,
  ConsequenceType,
  EtatCascade,
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
  /** Diagnostics générés lors de ce run (vide si aucune cible matchée). */
  diagnostics: BesoinDiagnostic[];
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
  /**
   * Diagnostic ciblé : pour chaque solution unifiée dont le N1 a ce nom,
   * compiler une comparaison détaillée des `agentsACompararer` sur le 1er
   * sous-besoin créé par ce N1. null = pas de diagnostic.
   */
  diagnosticTargetN1?: string | null;
  diagnosticAgentsACompararer?: readonly string[];
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
      solutions = enumererSolutions(besoin, etat, maxSolutionsParJs, {
        diversification: "MULTI_NIVEAU",
        exhaustif: true,
        maxCandidatsExhaustif: 30,
      });
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

  // ─── Diagnostic ciblé (optionnel) ───────────────────────────────────────
  const diagnostics: BesoinDiagnostic[] = [];
  if (params.diagnosticTargetN1 && params.diagnosticAgentsACompararer && params.diagnosticAgentsACompararer.length > 0) {
    const targetN1Upper = params.diagnosticTargetN1.toUpperCase();
    // Pour chaque JS, parcourir les solutions et trouver celles dont le N1
    // correspond au target. Compiler le diagnostic sur le 1er sous-besoin.
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
      const solutions = enumererSolutions(besoin, etat, maxSolutionsParJs, {
        diversification: "MULTI_NIVEAU",
      });

      for (const sol of solutions) {
        const racine = sol.resolutionRacine;
        if (racine.agent.nom.toUpperCase() !== targetN1Upper) continue;
        if (racine.consequences.length === 0) continue;

        // Le 1er sous-besoin est la 1ère conséquence — c'est ce que le user
        // veut diagnostiquer (BAD015R créé par Chennouf prenant le racine).
        const sousBesoin: Besoin = {
          id: `pli:${racine.consequences[0].jsImpactee.planningLigneId}`,
          jsCible: racine.consequences[0].jsImpactee,
          origine: {
            type: "LIBERATION",
            parentBesoinId: besoin.id,
            agentLibere: racine.agent.id,
            consequenceType: racine.consequences[0].type,
          },
          niveau: 1,
        };

        // Construire un état où Chennouf est déjà engagé sur la racine,
        // pour que la comparaison reflète l'état "post-affectation N1".
        const etatPostN1 = creerEtatInitial({
          agentsMap: params.agentsMap,
          index: params.index,
          rules: params.rules,
          lpaContext: params.lpaContext,
          npoExclusionCodes: params.npoExclusionCodes,
          importId: params.importId,
          remplacement: params.remplacement,
          deplacement: params.deplacement,
        });
        etatPostN1.affectationsCourantes.set(racine.agent.id, [js]);
        if (js.planningLigneId) etatPostN1.jsLibereesDansBranche.add(js.planningLigneId);
        etatPostN1.agentsEngagesBranche.add(racine.agent.id);

        const contexte = `créé par ${racine.agent.nom} ${racine.agent.prenom} prenant l'imprévu ${js.codeJs ?? "?"} ${js.date}`;
        diagnostics.push(
          comparerAgentsSurBesoin(sousBesoin, etatPostN1, params.diagnosticAgentsACompararer, contexte)
        );
        break; // un diagnostic par JS suffit
      }
    }
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
    diagnostics,
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

  // Diagnostics ciblés
  for (const diag of report.diagnostics) {
    emitDiagnostic(diag, logger);
  }
}

// ─── Diagnostic comparatif ───────────────────────────────────────────────────

/**
 * Détail d'évaluation d'un agent nommé sur un besoin donné. Réunit toutes
 * les informations utiles pour comprendre POURQUOI un agent est mieux ou
 * moins bien classé qu'un autre par le tri SCORE_LEGACY.
 */
export interface AgentDiagnostic {
  agentId: string;
  nom: string;
  prenom: string;
  /** Préfixes JS habilités déclarés sur la fiche agent. */
  prefixesJs: string[];
  agentReserve: boolean;
  /** Le préfixe du besoin est-il couvert par les habilitations de l'agent ? */
  habilite: boolean;
  /** Listé par findEligibleAgentsForJs (filtre structurel global) ? */
  eligible: boolean;
  /** Statut RH si évalué — "—" si écarté avant évaluation. */
  statut: "DIRECT" | "VIGILANCE" | "—";
  /** Score métier agrégé (0-100). 0 si non évaluable. */
  score: number;
  /** Décomposition fine du score (transparence). */
  scoreBreakdown: {
    base: number;
    penaliteViolations: number;
    penaliteConflits: number;
    bonusReserve: number;
    bonusJsZ: number;
    penaliteMargeRepos: number;
    penaliteGpt: number;
    total: number;
  };
  /** Faisable selon evaluerImpactComplet ? */
  faisable: boolean;
  raisonRejet?: string;
  /** Résumé des règles évaluées (extrait de DetailCalcul). */
  detailMin: {
    reposJournalierDisponibleMin: number | null;
    reposJournalierMinRequis: number;
    margeReposMin: number | null;
    gptActuel: number;
    gptMax: number;
    nbViolations: number;
    nbConflitsInduits: number;
  };
  /** Conséquences générées par cette affectation hypothétique. */
  consequences: Array<{
    type: ConsequenceType;
    jsImpacteeCode: string | null;
    jsImpacteeDate: string;
    jsImpacteeHoraires: string;
    description: string;
  }>;
}

export interface BesoinDiagnostic {
  besoin: {
    id: string;
    code: string | null;
    date: string;
    horaires: string;
    contexte: string;       // ex: "créé par CHENNOUF prenant l'imprévu GIC006R"
  };
  agentsCompares: AgentDiagnostic[];
}

/**
 * Évalue un ensemble d'agents nommés sur un besoin donné et compile leur
 * détail de score métier. Pas de side-effect (sauf décrément budget +
 * cache via evaluerImpactComplet).
 */
export function comparerAgentsSurBesoin(
  besoin: Besoin,
  etat: EtatCascade,
  agentNames: readonly string[],
  contexte: string
): BesoinDiagnostic {
  const eligibles = findEligibleAgentsForJs(
    etat.index,
    besoin.jsCible.codeJs,
    besoin.jsCible.isNuit,
    etat.deplacement
  );

  const cibles = new Set(agentNames.map((n) => n.toUpperCase()));
  const agentsCompares: AgentDiagnostic[] = [];

  // On parcourt agentsMap pour retrouver chaque agent ciblé par son nom
  for (const [, agentData] of etat.agentsMap) {
    const nomU = agentData.context.nom.toUpperCase();
    if (!cibles.has(nomU)) continue;

    const codeJs = besoin.jsCible.codeJs;
    const habilite = codeJs === null
      ? true
      : agentData.context.prefixesJs.some((p) =>
          codeJs.toUpperCase().startsWith(p.trim().toUpperCase())
        );
    const eligible = eligibles.has(agentData.context.id);

    if (!eligible) {
      agentsCompares.push({
        agentId: agentData.context.id,
        nom: agentData.context.nom,
        prenom: agentData.context.prenom,
        prefixesJs: agentData.context.prefixesJs,
        agentReserve: agentData.context.agentReserve,
        habilite,
        eligible,
        statut: "—",
        score: 0,
        scoreBreakdown: {
          base: 0, penaliteViolations: 0, penaliteConflits: 0,
          bonusReserve: 0, bonusJsZ: 0, penaliteMargeRepos: 0,
          penaliteGpt: 0, total: 0,
        },
        faisable: false,
        raisonRejet: !habilite ? "HABILITATION_PREFIXE" : "FILTRE_STRUCTUREL (nuit/déplacement)",
        detailMin: {
          reposJournalierDisponibleMin: null,
          reposJournalierMinRequis: 0,
          margeReposMin: null,
          gptActuel: 0,
          gptMax: 0,
          nbViolations: 0,
          nbConflitsInduits: 0,
        },
        consequences: [],
      });
      continue;
    }

    const eval_ = evaluerImpactComplet(agentData.context, besoin, etat);

    const breakdown = eval_.faisable
      ? scorerCandidatDetail({
          agentId: agentData.context.id,
          nom: agentData.context.nom,
          prenom: agentData.context.prenom,
          matricule: agentData.context.matricule,
          posteAffectation: agentData.context.posteAffectation,
          agentReserve: agentData.context.agentReserve,
          surJsZ: false,
          codeJsZOrigine: null,
          statut: eval_.statut === "VIGILANCE" ? "VIGILANCE" : "DIRECT",
          motifPrincipal: eval_.raisonRejet ?? "",
          detail: eval_.detail,
          conflitsInduits: [],
          nbConflits: eval_.consequences.length,
        })
      : {
          base: 0, penaliteViolations: 0, penaliteConflits: 0,
          bonusReserve: 0, bonusJsZ: 0, penaliteMargeRepos: 0,
          penaliteGpt: 0, total: 0,
        };

    const margeRepos = eval_.detail.reposJournalierDisponible !== null
      ? eval_.detail.reposJournalierDisponible - eval_.detail.reposJournalierMin
      : null;

    agentsCompares.push({
      agentId: agentData.context.id,
      nom: agentData.context.nom,
      prenom: agentData.context.prenom,
      prefixesJs: agentData.context.prefixesJs,
      agentReserve: agentData.context.agentReserve,
      habilite,
      eligible,
      statut: eval_.faisable ? eval_.statut : "—",
      score: breakdown.total,
      scoreBreakdown: breakdown,
      faisable: eval_.faisable,
      raisonRejet: eval_.raisonRejet,
      detailMin: {
        reposJournalierDisponibleMin: eval_.detail.reposJournalierDisponible,
        reposJournalierMinRequis: eval_.detail.reposJournalierMin,
        margeReposMin: margeRepos,
        gptActuel: eval_.detail.gptActuel,
        gptMax: eval_.detail.gptMax,
        nbViolations: eval_.detail.violations.length,
        nbConflitsInduits: eval_.consequences.length,
      },
      consequences: eval_.consequences.map((c) => ({
        type: c.type,
        jsImpacteeCode: c.jsImpactee.codeJs,
        jsImpacteeDate: c.jsImpactee.date,
        jsImpacteeHoraires: `${c.jsImpactee.heureDebut}–${c.jsImpactee.heureFin}`,
        description: c.description,
      })),
    });
  }

  // Tri par score décroissant pour faciliter la lecture
  agentsCompares.sort((a, b) => b.score - a.score);

  return {
    besoin: {
      id: besoin.id,
      code: besoin.jsCible.codeJs,
      date: besoin.jsCible.date,
      horaires: `${besoin.jsCible.heureDebut}–${besoin.jsCible.heureFin}`,
      contexte,
    },
    agentsCompares,
  };
}

/**
 * Émet le diagnostic comparatif sous forme de tableau lisible en console.
 */
export function emitDiagnostic(report: BesoinDiagnostic, logger?: LogCollector): void {
  logger?.info("UNIFIED_DIAG_AGENTS", {
    data: {
      besoin: report.besoin,
      agents: report.agentsCompares as unknown as Record<string, unknown>[],
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    `\n[UNIFIED_DIAG] Besoin ${report.besoin.code ?? "?"} ${report.besoin.date} ${report.besoin.horaires}` +
      `\n  contexte : ${report.besoin.contexte}` +
      `\n  agents comparés (triés par score décroissant) :`
  );
  for (const a of report.agentsCompares) {
    const csqStr = a.consequences.length === 0
      ? "(libre)"
      : a.consequences
          .map((c) => `${c.type}@${c.jsImpacteeCode ?? "?"} ${c.jsImpacteeDate}`)
          .join(" + ");
    // eslint-disable-next-line no-console
    console.log(
      `\n    ${a.nom.padEnd(12)} ${a.prenom.padEnd(10)}` +
        ` | habil=${a.habilite ? "OUI" : "NON"}` +
        ` | élig=${a.eligible ? "OUI" : "NON"}` +
        ` | statut=${a.statut.padEnd(9)}` +
        ` | score=${String(a.score).padStart(3)}` +
        ` | reposDispo=${a.detailMin.reposJournalierDisponibleMin ?? "?"}min/${a.detailMin.reposJournalierMinRequis}min` +
        ` | marge=${a.detailMin.margeReposMin ?? "?"}min` +
        ` | GPT=${a.detailMin.gptActuel}/${a.detailMin.gptMax}` +
        ` | viol=${a.detailMin.nbViolations} csq=${a.detailMin.nbConflitsInduits}` +
        ` | réserve=${a.agentReserve ? "OUI" : "NON"}` +
        (a.raisonRejet ? ` | rejet=${a.raisonRejet}` : "") +
        `\n      breakdown: base${a.scoreBreakdown.base}` +
        ` -viol${a.scoreBreakdown.penaliteViolations}` +
        ` -csq${a.scoreBreakdown.penaliteConflits}` +
        ` +rsv${a.scoreBreakdown.bonusReserve}` +
        ` +jsZ${a.scoreBreakdown.bonusJsZ}` +
        ` -mrg${a.scoreBreakdown.penaliteMargeRepos}` +
        ` -gpt${a.scoreBreakdown.penaliteGpt}` +
        ` = ${a.scoreBreakdown.total}` +
        `\n      conséquences: ${csqStr}` +
        `\n      préfixes habil: ${a.prefixesJs.join(", ") || "(aucun)"}`
    );
  }
}

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
  Resolution,
  Solution,
} from "./types";

// ─── Types de rapport ────────────────────────────────────────────────────────

/**
 * Métriques RH d'une étape de chaîne — extraites de DetailCalcul. Format
 * partagé entre la sortie shadow (logs) et l'adaptation UI.
 */
interface EtapeMetricsRH {
  reposDisponibleMin: number | null;
  reposRequisMin: number;
  margeReposMin: number | null;
  gptActuel: number;
  gptMax: number;
  teCumule48hMin: number;
  nbViolations: number;
  nbConflitsInduits: number;
}

interface SolutionResume {
  n1Id: string;
  n1Nom: string;
  n1Prenom: string;
  profondeur: number;
  niveauRisque: NiveauRisque;
  /** Aplatissement post-ordre (feuilles puis racine), pour lecture séquentielle. */
  chaine: Array<{
    agentId: string;
    agentNom: string;
    agentPrenom: string;
    agentReserve: boolean;
    jsCode: string | null;
    jsDate: string;
    jsHoraires: string;
    consequenceType: ConsequenceType | "RACINE";
    consequenceDescription: string;
    statut: "DIRECT" | "VIGILANCE";
    score: number;
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
    metrics: EtapeMetricsRH;
    motifPrincipal: string;
    prefixesJs: readonly string[];
  }>;
  /** Phrase de synthèse des pénalités dominantes — pour la ligne "Pourquoi ce rang". */
  resumePenalites?: string;
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
  /** Résultat de la séquence forcée si demandée. */
  sequenceForceeResultat?: ResultatSequenceForcee;
}

// ─── Helpers d'aplatissement de Solution ─────────────────────────────────────

function aplatirSolutionPourLog(solution: Solution): SolutionResume {
  // Les conséquences sont stockées sur le NŒUD parent — chaque sous-resolution
  // correspond à une conséquence du parent. Pour afficher la description sur
  // l'étape libérée, on construit un index parent → consequence par
  // jsImpactee.planningLigneId.
  const consequenceByJsId = new Map<string, { type: ConsequenceType; description: string }>();
  function indexConsequences(r: Resolution): void {
    for (let i = 0; i < r.consequences.length; i++) {
      const c = r.consequences[i];
      if (c.jsImpactee.planningLigneId) {
        consequenceByJsId.set(c.jsImpactee.planningLigneId, {
          type: c.type,
          description: c.description,
        });
      }
      if (r.sousResolutions[i]) indexConsequences(r.sousResolutions[i]);
    }
  }
  indexConsequences(solution.resolutionRacine);

  const chaine = solution.resolutionsAplaties.map((r) => {
    const consequenceType: ConsequenceType | "RACINE" =
      r.besoin.origine.type === "RACINE"
        ? "RACINE"
        : r.besoin.origine.consequenceType;

    // La description vient de la conséquence du parent qui pointe vers cette JS.
    const conseqInfo = r.besoin.jsCible.planningLigneId
      ? consequenceByJsId.get(r.besoin.jsCible.planningLigneId)
      : undefined;

    // Score breakdown depuis r.detail (calculé par le moteur RH).
    const breakdown = scorerCandidatDetail({
      agentId: r.agent.id,
      nom: r.agent.nom,
      prenom: r.agent.prenom,
      matricule: r.agent.matricule,
      posteAffectation: r.agent.posteAffectation,
      agentReserve: r.agent.agentReserve,
      surJsZ: false,
      codeJsZOrigine: null,
      statut: r.statut,
      motifPrincipal: "",
      detail: r.detail,
      conflitsInduits: [],
      nbConflits: r.consequences.length,
    });

    const margeRepos =
      r.detail.reposJournalierDisponible !== null
        ? r.detail.reposJournalierDisponible - r.detail.reposJournalierMin
        : null;

    return {
      agentId: r.agent.id,
      agentNom: r.agent.nom,
      agentPrenom: r.agent.prenom,
      agentReserve: r.agent.agentReserve,
      jsCode: r.besoin.jsCible.codeJs,
      jsDate: r.besoin.jsCible.date,
      jsHoraires: `${r.besoin.jsCible.heureDebut}–${r.besoin.jsCible.heureFin}`,
      consequenceType,
      consequenceDescription: conseqInfo?.description ?? "",
      statut: r.statut,
      score: r.score,
      scoreBreakdown: breakdown,
      metrics: {
        reposDisponibleMin: r.detail.reposJournalierDisponible,
        reposRequisMin: r.detail.reposJournalierMin,
        margeReposMin: margeRepos,
        gptActuel: r.detail.gptActuel,
        gptMax: r.detail.gptMax,
        teCumule48hMin: r.detail.teGptCumulAvant,
        nbViolations: r.detail.violations.length,
        nbConflitsInduits: r.consequences.length,
      },
      motifPrincipal: r.detail.violations[0]?.description ?? "",
      prefixesJs: r.agent.prefixesJs,
    };
  });

  // Le N1 (l'agent qui prend l'imprévu racine) est la racine — donc le DERNIER
  // élément de l'aplatissement post-ordre.
  const racine = solution.resolutionsAplaties[solution.resolutionsAplaties.length - 1];

  // Synthèse des pénalités dominantes pour la ligne "Pourquoi ce rang"
  const resumePenalites = construireResumePenalites(chaine);

  return {
    n1Id: racine.agent.id,
    n1Nom: racine.agent.nom,
    n1Prenom: racine.agent.prenom,
    profondeur: solution.profondeurMax,
    niveauRisque: solution.niveauRisque,
    chaine,
    resumePenalites,
  };
}

/**
 * Construit une phrase courte expliquant les pénalités principales d'une
 * solution. Repère l'étape la plus pénalisée (score le plus bas) et résume
 * en une ligne ce qui pèse le plus.
 *
 * Retourne undefined si la solution est globalement saine (toutes étapes ≥ 80).
 */
function construireResumePenalites(
  chaine: ReadonlyArray<SolutionResume["chaine"][number]>
): string | undefined {
  if (chaine.length === 0) return undefined;
  // Trouver l'étape dont le score est le plus bas
  let pire = chaine[0];
  for (const e of chaine) {
    if (e.score < pire.score) pire = e;
  }
  if (pire.score >= 80) return undefined;

  const parts: string[] = [];
  if (pire.scoreBreakdown.penaliteGpt > 0) {
    parts.push(`GPT ${pire.metrics.gptActuel}/${pire.metrics.gptMax}`);
  }
  if (pire.scoreBreakdown.penaliteMargeRepos > 0 && pire.metrics.margeReposMin !== null) {
    const m = pire.metrics.margeReposMin;
    parts.push(`marge repos ${m >= 0 ? "+" : ""}${m}min`);
  }
  if (pire.scoreBreakdown.penaliteViolations > 0) {
    parts.push(`${pire.metrics.nbViolations} violation${pire.metrics.nbViolations > 1 ? "s" : ""} RH`);
  }
  if (pire.scoreBreakdown.penaliteConflits > 0) {
    parts.push(`${pire.metrics.nbConflitsInduits} conséquence${pire.metrics.nbConflitsInduits > 1 ? "s" : ""}`);
  }
  if (parts.length === 0) return undefined;
  return `Pénalité dominante sur ${pire.agentNom} (score ${pire.score}) : ${parts.join(" + ")}`;
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
  /** Cap sur le nombre de solutions énumérées par JS. Défaut : 5 (perf-friendly). */
  maxSolutionsParJs?: number;
  /** Budget d'évaluations par JS. Défaut : 3000 (perf-friendly). 12000 en mode complet. */
  budgetParJs?: number;
  /** Active la phase 3 (mode exhaustif). Défaut : false (perf-friendly). */
  exhaustif?: boolean;
  /** Séquence cible à détecter (noms d'agents). null = pas de check. */
  sequenceCibleNoms?: readonly string[] | null;
  /**
   * Diagnostic ciblé : pour chaque solution unifiée dont le N1 a ce nom,
   * compiler une comparaison détaillée des `agentsACompararer` sur le 1er
   * sous-besoin créé par ce N1. null = pas de diagnostic.
   */
  diagnosticTargetN1?: string | null;
  diagnosticAgentsACompararer?: readonly string[];
  /**
   * Diagnostic chaîné (optionnel) : si fourni, après le diagnostic du
   * sous-besoin du N1, on évalue hypothétiquement diagnosticAgentN2 et,
   * s'il est faisable, on compile un second diagnostic comparant
   * diagnosticAgentsN3 sur la 1ère conséquence du N2 (= sous-sous-besoin).
   *
   * Exemple : N1=CHENNOUF, N2=BROUILLAT, agentsN3=[LEGUAY, autres] →
   * 2 diagnostics : un sur BAD015R, un sur GIC015.
   */
  diagnosticAgentN2?: string;
  diagnosticAgentsN3?: readonly string[];
  /**
   * Test de séquence forcée (optionnel) : ordre d'agents+JS à valider.
   * Indépendant de la résolution récursive du solveur — vérifie chaque
   * étape isolément et retourne possible/impossible avec raison exacte.
   */
  sequenceForceeASim?: ReadonlyArray<EtapeSequenceForcee>;
  /**
   * JS racine pour la séquence forcée. Utilisée comme point de départ
   * (étape 0). Doit matcher `sequenceForceeASim[0].jsCodeAttendu`.
   */
  sequenceForceeJsRacine?: JsCible | null;
}

export function runShadowComparison(params: RunShadowParams): ShadowReport {
  const maxSolutionsParJs = params.maxSolutionsParJs ?? 5;
  const budgetParJs = params.budgetParJs ?? 3000;
  const exhaustif = params.exhaustif ?? false;
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
      budget: budgetParJs,
    });

    const besoin = besoinRacineFromJs(js);
    let solutions: Solution[] = [];
    let raisonSiVide: string | undefined;
    try {
      solutions = enumererSolutions(besoin, etat, maxSolutionsParJs, {
        diversification: "MULTI_NIVEAU",
        exhaustif,
        maxCandidatsExhaustif: 30,
      });
    } catch (err) {
      raisonSiVide = err instanceof Error ? err.message : "erreur inconnue";
    }
    if (solutions.length === 0 && !raisonSiVide) {
      raisonSiVide = "AUCUNE_SOLUTION";
    }

    budgetTotal += budgetParJs - etat.budget.remaining;

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
        budgetConsomme: budgetParJs - etat.budget.remaining,
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

        // ── Diagnostic chaîné : si l'utilisateur a fourni `diagnosticAgentsN3`,
        // évaluer hypothétiquement BROUILLAT (premier de la liste N2) sur
        // BAD015R, et si Brouillat est faisable, comparer Leguay et autres
        // sur le 1er sous-besoin de Brouillat (= GIC015).
        if (params.diagnosticAgentsN3 && params.diagnosticAgentsN3.length > 0
            && params.diagnosticAgentN2) {
          const brouillatNomU = params.diagnosticAgentN2.toUpperCase();
          let brouillatData: AgentDataMultiJs | null = null;
          for (const [, ad] of params.agentsMap) {
            if (ad.context.nom.toUpperCase() === brouillatNomU) {
              brouillatData = ad;
              break;
            }
          }
          if (brouillatData) {
            const evalBrouillat = evaluerImpactComplet(brouillatData.context, sousBesoin, etatPostN1);
            if (evalBrouillat.faisable && evalBrouillat.consequences.length > 0) {
              // Construire l'état post-Brouillat
              const etatPostN2 = creerEtatInitial({
                agentsMap: params.agentsMap,
                index: params.index,
                rules: params.rules,
                lpaContext: params.lpaContext,
                npoExclusionCodes: params.npoExclusionCodes,
                importId: params.importId,
                remplacement: params.remplacement,
                deplacement: params.deplacement,
              });
              etatPostN2.affectationsCourantes.set(racine.agent.id, [js]);
              etatPostN2.affectationsCourantes.set(brouillatData.context.id, [sousBesoin.jsCible]);
              if (js.planningLigneId) etatPostN2.jsLibereesDansBranche.add(js.planningLigneId);
              if (sousBesoin.jsCible.planningLigneId) {
                etatPostN2.jsLibereesDansBranche.add(sousBesoin.jsCible.planningLigneId);
              }
              etatPostN2.agentsEngagesBranche.add(racine.agent.id);
              etatPostN2.agentsEngagesBranche.add(brouillatData.context.id);

              // Premier conséquence de Brouillat = sous-sous-besoin (GIC015 typiquement)
              const sousSousBesoin: Besoin = {
                id: `pli:${evalBrouillat.consequences[0].jsImpactee.planningLigneId}`,
                jsCible: evalBrouillat.consequences[0].jsImpactee,
                origine: {
                  type: "LIBERATION",
                  parentBesoinId: sousBesoin.id,
                  agentLibere: brouillatData.context.id,
                  consequenceType: evalBrouillat.consequences[0].type,
                },
                niveau: 2,
              };

              const contexteN3 = `créé par ${brouillatData.context.nom} prenant ${sousBesoin.jsCible.codeJs ?? "?"} (lui-même libéré par ${racine.agent.nom} sur ${js.codeJs ?? "?"})`;
              diagnostics.push(
                comparerAgentsSurBesoin(sousSousBesoin, etatPostN2, params.diagnosticAgentsN3, contexteN3)
              );
            }
          }
        }

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

  // ─── Séquence forcée (optionnelle) ──────────────────────────────────────
  let sequenceForceeResultat: ResultatSequenceForcee | undefined;
  if (params.sequenceForceeASim && params.sequenceForceeASim.length > 0 && params.sequenceForceeJsRacine) {
    const etatSeq = creerEtatInitial({
      agentsMap: params.agentsMap,
      index: params.index,
      rules: params.rules,
      lpaContext: params.lpaContext,
      npoExclusionCodes: params.npoExclusionCodes,
      importId: params.importId,
      remplacement: params.remplacement,
      deplacement: params.deplacement,
    });
    sequenceForceeResultat = testerSequenceForcee(
      params.sequenceForceeJsRacine,
      params.sequenceForceeASim,
      etatSeq
    );
  }

  return {
    scenarioId: params.scenarioId,
    scenarioTitre: params.scenarioTitre,
    nbJsAnalysees: diffsParJs.length,
    diffsParJs,
    agregat,
    diagnostics,
    sequenceForceeResultat,
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

  // Séquence forcée
  if (report.sequenceForceeResultat) {
    emitTestSequence(report.sequenceForceeResultat, logger);
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

// ─── Adapter ShadowReport → UnifiedReportUI (pour exposition côté UI) ──────

import type {
  UnifiedReportUI,
  UnifiedJsAnalyseUI,
  UnifiedSolutionUI,
  SequenceForceeUI,
} from "@/types/multi-js-simulation";

/**
 * Convertit un ShadowReport en UnifiedReportUI (slim, sans diagnostics
 * verbeux). Utilisé pour exposer le solveur unifié à l'UI quand
 * FEATURE_UNIFIED_PRIMARY est actif.
 */
export function adapterShadowReportPourUI(report: ShadowReport): UnifiedReportUI {
  const jsAnalyses: UnifiedJsAnalyseUI[] = report.diffsParJs.map((d) => ({
    jsId: d.jsId,
    jsCode: d.jsCode,
    jsDate: d.jsDate,
    jsHoraires: d.jsHoraires,
    legacyAgentRetenu: d.legacy.agentRetenu,
    legacyStatut: d.legacy.statut,
    solutions: d.unified.solutions.map(
      (s): UnifiedSolutionUI => ({
        n1AgentId: s.n1Id,
        n1Nom: s.n1Nom,
        n1Prenom: s.n1Prenom,
        profondeur: s.profondeur,
        niveauRisque: s.niveauRisque === "INCOMPLETE" ? "INCOMPLETE" : s.niveauRisque,
        chaine: s.chaine.map((c) => ({
          agentId: c.agentId,
          agentNom: c.agentNom,
          agentPrenom: c.agentPrenom,
          agentReserve: c.agentReserve,
          jsCode: c.jsCode,
          jsDate: c.jsDate,
          jsHoraires: c.jsHoraires,
          consequenceType: c.consequenceType,
          consequenceDescription: c.consequenceDescription,
          statut: c.statut,
          score: c.score,
          scoreBreakdown: c.scoreBreakdown,
          metrics: c.metrics,
          motifPrincipal: c.motifPrincipal,
          prefixesJs: c.prefixesJs,
        })),
        resumePenalites: s.resumePenalites,
      })
    ),
    budgetConsomme: d.unified.budgetConsomme,
    raisonSiVide: d.unified.raisonSiVide,
  }));

  let sequenceForceeResultat: SequenceForceeUI | undefined;
  if (report.sequenceForceeResultat) {
    sequenceForceeResultat = {
      possible: report.sequenceForceeResultat.possible,
      synthese: report.sequenceForceeResultat.synthese,
      etapeEchec: report.sequenceForceeResultat.etapeEchec,
      trace: report.sequenceForceeResultat.trace.map((t) => ({
        numero: t.numero,
        agentNom: t.agentNom,
        besoinCode: t.besoinCode,
        besoinDate: t.besoinDate,
        besoinHoraires: t.besoinHoraires,
        faisable: t.faisable,
        statut: t.statut,
        raisonEchec: t.raisonEchec,
        consequences: t.consequences,
      })),
    };
  }

  return {
    jsAnalyses,
    agregat: report.agregat,
    sequenceForceeResultat,
  };
}

// ─── Test de séquence forcée ─────────────────────────────────────────────────

/**
 * Une étape d'une séquence forcée : un agent nommé prend une JS
 * (pour le racine, c'est l'imprévu ; sinon, on cherche dans les conséquences
 * de l'étape précédente la JS dont le code matche).
 */
export interface EtapeSequenceForcee {
  agentName: string;
  /** Code JS attendu (ex: "GIC006R", "BAD015R", "GIC015"). Pour le racine,
   *  c'est le code de l'imprévu. Pour les sous-étapes, on cherche dans les
   *  conséquences de l'étape précédente la JS dont le codeJs matche. */
  jsCodeAttendu: string;
}

/**
 * Trace d'une étape : agent + besoin + résultat de l'évaluation.
 */
export interface TraceSequence {
  numero: number;
  agentNom: string;
  agentTrouve: boolean;
  besoinCode: string | null;
  besoinDate: string | null;
  besoinHoraires: string | null;
  faisable: boolean;
  statut?: string;
  score?: number;
  consequences: Array<{
    type: ConsequenceType;
    code: string | null;
    date: string;
    horaires: string;
  }>;
  raisonEchec?: string;
}

export interface ResultatSequenceForcee {
  /** True ssi TOUTES les étapes ont réussi. */
  possible: boolean;
  /** Trace détaillée de chaque étape (succès ou échec). */
  trace: TraceSequence[];
  /** Index (0-based) de l'étape qui a échoué. -1 si tout a réussi. */
  etapeEchec: number;
  /** Synthèse en une ligne pour log/UI. */
  synthese: string;
}

/**
 * Teste une séquence forcée d'affectations : pour chaque étape, vérifie que
 * l'agent peut prendre la JS dans l'état courant, puis enrichit l'état avec
 * cette affectation et passe à l'étape suivante. Retourne la première raison
 * d'échec rencontrée, ou possible:true si toutes les étapes passent.
 *
 * Ne fait AUCUN appel récursif au solveur — chaque étape est évaluée en
 * isolation via evaluerImpactComplet (les conséquences sont identifiées mais
 * pas résolues récursivement).
 *
 * Pour Chennouf → Brouillat → Leguay :
 *  - Étape 0 : CHENNOUF prend GIC006R (l'imprévu, racine).
 *  - Étape 1 : BROUILLAT prend BAD015R (= conséquence de Chennouf, code BAD015R).
 *  - Étape 2 : LEGUAY prend GIC015 (= conséquence de Brouillat, code GIC015).
 */
export function testerSequenceForcee(
  jsRacine: JsCible,
  etapes: readonly EtapeSequenceForcee[],
  etatInitial: EtatCascade
): ResultatSequenceForcee {
  const trace: TraceSequence[] = [];
  let etat = creerEtatInitial({
    agentsMap: etatInitial.agentsMap,
    index: etatInitial.index,
    rules: etatInitial.rules,
    lpaContext: etatInitial.lpaContext,
    npoExclusionCodes: etatInitial.npoExclusionCodes,
    importId: etatInitial.importId,
    remplacement: etatInitial.remplacement,
    deplacement: etatInitial.deplacement,
  });

  let besoinCourant: Besoin | null = besoinRacineFromJs(jsRacine);
  let consequencesEtapePrec: Array<{ type: ConsequenceType; jsImpactee: JsCible }> = [];

  for (let i = 0; i < etapes.length; i++) {
    const etape = etapes[i];

    // Pour i>0, on doit retrouver le besoin dans les conséquences de l'étape
    // précédente (matching par jsCodeAttendu).
    if (i > 0) {
      const conseq = consequencesEtapePrec.find(
        (c) => (c.jsImpactee.codeJs ?? "").toUpperCase() === etape.jsCodeAttendu.toUpperCase()
      );
      if (!conseq) {
        const codes = consequencesEtapePrec.map((c) => c.jsImpactee.codeJs ?? "?").join(", ");
        trace.push({
          numero: i,
          agentNom: etape.agentName,
          agentTrouve: false,
          besoinCode: null,
          besoinDate: null,
          besoinHoraires: null,
          faisable: false,
          consequences: [],
          raisonEchec: `JS ${etape.jsCodeAttendu} introuvable dans les conséquences de l'étape précédente (codes disponibles : ${codes || "aucun"})`,
        });
        return {
          possible: false,
          trace,
          etapeEchec: i,
          synthese: `Étape ${i + 1} (${etape.agentName} sur ${etape.jsCodeAttendu}) impossible : conséquence introuvable`,
        };
      }
      besoinCourant = {
        id: `pli:${conseq.jsImpactee.planningLigneId}`,
        jsCible: conseq.jsImpactee,
        origine: { type: "RACINE" },  // simplifié pour le test ; on évalue indépendamment
        niveau: i,
      };
    }

    if (besoinCourant === null) {
      trace.push({
        numero: i,
        agentNom: etape.agentName,
        agentTrouve: false,
        besoinCode: null,
        besoinDate: null,
        besoinHoraires: null,
        faisable: false,
        consequences: [],
        raisonEchec: "Besoin courant null",
      });
      return { possible: false, trace, etapeEchec: i, synthese: "Erreur interne" };
    }

    // Trouver l'agent par nom
    let agentTrouve: AgentDataMultiJs | null = null;
    for (const [, ad] of etat.agentsMap) {
      if (ad.context.nom.toUpperCase() === etape.agentName.toUpperCase()) {
        agentTrouve = ad;
        break;
      }
    }

    if (!agentTrouve) {
      trace.push({
        numero: i,
        agentNom: etape.agentName,
        agentTrouve: false,
        besoinCode: besoinCourant.jsCible.codeJs,
        besoinDate: besoinCourant.jsCible.date,
        besoinHoraires: `${besoinCourant.jsCible.heureDebut}–${besoinCourant.jsCible.heureFin}`,
        faisable: false,
        consequences: [],
        raisonEchec: `Agent ${etape.agentName} introuvable dans agentsMap`,
      });
      return {
        possible: false,
        trace,
        etapeEchec: i,
        synthese: `Étape ${i + 1} : agent ${etape.agentName} introuvable`,
      };
    }

    // Vérifier que le code JS du besoin matche l'attente (sécurité)
    if (
      besoinCourant.jsCible.codeJs &&
      besoinCourant.jsCible.codeJs.toUpperCase() !== etape.jsCodeAttendu.toUpperCase()
    ) {
      trace.push({
        numero: i,
        agentNom: etape.agentName,
        agentTrouve: true,
        besoinCode: besoinCourant.jsCible.codeJs,
        besoinDate: besoinCourant.jsCible.date,
        besoinHoraires: `${besoinCourant.jsCible.heureDebut}–${besoinCourant.jsCible.heureFin}`,
        faisable: false,
        consequences: [],
        raisonEchec: `Code JS attendu ${etape.jsCodeAttendu}, trouvé ${besoinCourant.jsCible.codeJs}`,
      });
      return {
        possible: false,
        trace,
        etapeEchec: i,
        synthese: `Étape ${i + 1} : mismatch de code JS`,
      };
    }

    // Évaluer
    const eval_ = evaluerImpactComplet(agentTrouve.context, besoinCourant, etat);

    trace.push({
      numero: i,
      agentNom: etape.agentName,
      agentTrouve: true,
      besoinCode: besoinCourant.jsCible.codeJs,
      besoinDate: besoinCourant.jsCible.date,
      besoinHoraires: `${besoinCourant.jsCible.heureDebut}–${besoinCourant.jsCible.heureFin}`,
      faisable: eval_.faisable,
      statut: eval_.statut,
      consequences: eval_.consequences.map((c) => ({
        type: c.type,
        code: c.jsImpactee.codeJs,
        date: c.jsImpactee.date,
        horaires: `${c.jsImpactee.heureDebut}–${c.jsImpactee.heureFin}`,
      })),
      raisonEchec: eval_.faisable ? undefined : eval_.raisonRejet,
    });

    if (!eval_.faisable) {
      return {
        possible: false,
        trace,
        etapeEchec: i,
        synthese: `Étape ${i + 1} (${etape.agentName} sur ${etape.jsCodeAttendu}) impossible : ${eval_.raisonRejet}`,
      };
    }

    // Étape réussie : enrichir l'état pour l'étape suivante
    const cur = etat.affectationsCourantes.get(agentTrouve.context.id) ?? [];
    etat.affectationsCourantes = new Map(etat.affectationsCourantes);
    etat.affectationsCourantes.set(agentTrouve.context.id, [...cur, besoinCourant.jsCible]);
    if (besoinCourant.jsCible.planningLigneId) {
      etat.jsLibereesDansBranche = new Set([
        ...etat.jsLibereesDansBranche,
        besoinCourant.jsCible.planningLigneId,
      ]);
    }
    etat.agentsEngagesBranche = new Set([
      ...etat.agentsEngagesBranche,
      agentTrouve.context.id,
    ]);

    consequencesEtapePrec = eval_.consequences.map((c) => ({
      type: c.type,
      jsImpactee: c.jsImpactee,
    }));
  }

  return {
    possible: true,
    trace,
    etapeEchec: -1,
    synthese: `Séquence ${etapes.map((e) => e.agentName).join(" → ")} : POSSIBLE (${etapes.length} étapes validées)`,
  };
}

/**
 * Émet un rapport de séquence forcée en console + logger.
 */
export function emitTestSequence(
  resultat: ResultatSequenceForcee,
  logger?: LogCollector
): void {
  logger?.info("UNIFIED_SEQUENCE_FORCEE", {
    data: {
      possible: resultat.possible,
      etapeEchec: resultat.etapeEchec,
      synthese: resultat.synthese,
      trace: resultat.trace as unknown as Record<string, unknown>[],
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    `\n[UNIFIED_SEQUENCE] ${resultat.synthese}` +
      `\n  possible : ${resultat.possible ? "OUI" : "NON"}` +
      (resultat.etapeEchec >= 0 ? `\n  étape échec : ${resultat.etapeEchec + 1}` : "")
  );
  for (const t of resultat.trace) {
    // eslint-disable-next-line no-console
    console.log(
      `\n    Étape ${t.numero + 1} : ${t.agentNom}` +
        ` sur ${t.besoinCode ?? "?"} ${t.besoinDate ?? ""} ${t.besoinHoraires ?? ""}` +
        `\n      → ${t.faisable ? `FAISABLE (statut=${t.statut})` : `ÉCHEC (${t.raisonEchec})`}` +
        (t.consequences.length > 0
          ? `\n      conséquences : ${t.consequences.map((c) => `${c.type}@${c.code ?? "?"} ${c.date}`).join(" + ")}`
          : "")
    );
  }
}

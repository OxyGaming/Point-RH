/**
 * Adapter pour invoquer le solveur unifié depuis l'API single-JS
 * (`/api/js-simulation`) — entrée jsCible + imprevu + liste d'agents bruts.
 *
 * Symétrique de `runShadowComparison` côté multi-JS, mais simplifié pour le
 * cas d'1 seule JS : pas d'allocation greedy, pas de comparaison legacy
 * détaillée — juste l'énumération de solutions unifiées sur ce besoin racine.
 */

import type { JsCible, ImpreuvuConfig } from "@/types/js-simulation";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";
import { buildCoverageIndex } from "@/lib/simulation/multiJs/chaineCache";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { ShadowReport, ShadowDiffParJs } from "./shadow";
import { creerEtatInitial } from "./etat";
import { besoinRacineFromJs, enumererSolutions } from "./solveur";
import { scorerCandidatDetail } from "@/lib/simulation/scenarioScorer";
import type { ConsequenceType, NiveauRisque, Resolution } from "./types";

interface RunUnifiedSingleJsArgs {
  jsCible: JsCible;
  imprevu: ImpreuvuConfig;
  agents: AgentDataMultiJs[];
  /** Cap solutions par défaut 12 — aligné avec le multi-JS. */
  maxSolutionsParJs?: number;
}

/**
 * Lance le solveur unifié sur 1 JS imprévue (besoin racine) et reconstruit un
 * ShadowReport minimal pour pouvoir réutiliser `adapterShadowReportPourUI`.
 *
 * Le legacy (executerSimulationJS) reste totalement inchangé — ce flow est
 * uniquement appelé en post-traitement quand FEATURE_UNIFIED_PRIMARY=1.
 */
export function runUnifiedForSingleJs(args: RunUnifiedSingleJsArgs): ShadowReport {
  const { jsCible, imprevu, agents } = args;
  const maxSolutionsParJs = args.maxSolutionsParJs ?? 12;

  const agentsMap = new Map(agents.map((a) => [a.context.id, a]));
  const index = buildCoverageIndex(agents);
  const remplacement = imprevu.remplacement;
  const deplacement = imprevu.deplacement;

  const etat = creerEtatInitial({
    agentsMap,
    index,
    rules: DEFAULT_WORK_RULES_MINUTES,
    importId: jsCible.importId,
    remplacement,
    deplacement,
  });

  const besoin = besoinRacineFromJs(jsCible);
  const solutions = enumererSolutions(besoin, etat, maxSolutionsParJs, {
    diversification: "MULTI_NIVEAU",
    exhaustif: true,
    maxCandidatsExhaustif: 30,
  });

  // Construire un ShadowDiffParJs minimaliste — pas de comparaison legacy en
  // single-JS (pas de greedy ; le legacy retourne juste mobilisables/refusés
  // par règle). On laisse les champs `legacy.*` à null pour l'UI.
  const diff: ShadowDiffParJs = {
    jsId: jsCible.planningLigneId,
    jsCode: jsCible.codeJs,
    jsDate: jsCible.date,
    jsHoraires: `${jsCible.heureDebut}–${jsCible.heureFin}`,
    legacy: {
      agentRetenu: null,
      statut: null,
      nbCascadeModifs: 0,
      cascadeAgents: [],
      chaineMaillons: [],
    },
    unified: {
      nbSolutions: solutions.length,
      budgetConsomme: 12000 - etat.budget.remaining,
      raisonSiVide: solutions.length === 0 ? "AUCUNE_SOLUTION" : undefined,
      solutions: solutions.map((sol) => {
        // Index parent → conséquence (par planningLigneId de jsImpactee) pour
        // récupérer la description précise de chaque conséquence.
        const conseqByJsId = new Map<string, { type: ConsequenceType; description: string }>();
        function indexConseq(r: Resolution): void {
          for (let i = 0; i < r.consequences.length; i++) {
            const c = r.consequences[i];
            if (c.jsImpactee.planningLigneId) {
              conseqByJsId.set(c.jsImpactee.planningLigneId, {
                type: c.type,
                description: c.description,
              });
            }
            if (r.sousResolutions[i]) indexConseq(r.sousResolutions[i]);
          }
        }
        indexConseq(sol.resolutionRacine);

        const chaine = sol.resolutionsAplaties.map((r) => {
          const consequenceType: ConsequenceType | "RACINE" =
            r.besoin.origine.type === "RACINE"
              ? "RACINE"
              : r.besoin.origine.consequenceType;
          const conseqInfo = r.besoin.jsCible.planningLigneId
            ? conseqByJsId.get(r.besoin.jsCible.planningLigneId)
            : undefined;

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

        // Synthèse "Pourquoi ce rang" — repérage de l'étape la plus pénalisée
        let resumePenalites: string | undefined;
        if (chaine.length > 0) {
          let pire = chaine[0];
          for (const e of chaine) if (e.score < pire.score) pire = e;
          if (pire.score < 80) {
            const parts: string[] = [];
            if (pire.scoreBreakdown.penaliteGpt > 0) parts.push(`GPT ${pire.metrics.gptActuel}/${pire.metrics.gptMax}`);
            if (pire.scoreBreakdown.penaliteMargeRepos > 0 && pire.metrics.margeReposMin !== null) {
              const m = pire.metrics.margeReposMin;
              parts.push(`marge repos ${m >= 0 ? "+" : ""}${m}min`);
            }
            if (pire.scoreBreakdown.penaliteViolations > 0) parts.push(`${pire.metrics.nbViolations} violation(s) RH`);
            if (pire.scoreBreakdown.penaliteConflits > 0) parts.push(`${pire.metrics.nbConflitsInduits} conséquence(s)`);
            if (parts.length > 0) {
              resumePenalites = `Pénalité dominante sur ${pire.agentNom} (score ${pire.score}) : ${parts.join(" + ")}`;
            }
          }
        }

        const racine = sol.resolutionsAplaties[sol.resolutionsAplaties.length - 1];
        return {
          n1Id: racine.agent.id,
          n1Nom: racine.agent.nom,
          n1Prenom: racine.agent.prenom,
          profondeur: sol.profondeurMax,
          niveauRisque: sol.niveauRisque,
          chaine,
          resumePenalites,
        };
      }),
    },
    diff: {
      n1AgentMatch: false,
      unifiedTrouveLegacyEchoue: false,
      legacyCouvreUnifiedEchoue: false,
      sequenceCibleTrouvee: null,
    },
  };

  return {
    scenarioId: `single-js-${jsCible.planningLigneId}`,
    scenarioTitre: `Analyse imprévu — ${jsCible.codeJs ?? "?"} ${jsCible.date}`,
    nbJsAnalysees: 1,
    diffsParJs: [diff],
    agregat: {
      nbN1Match: 0,
      nbUnifiedSeul: 0,
      nbLegacySeul: 0,
      nbSequenceCibleTrouvee: 0,
      budgetTotal: 12000 - etat.budget.remaining,
    },
    diagnostics: [],
  };
}

// Réexports pour l'API
export type { NiveauRisque };

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
import type { ConsequenceType, NiveauRisque } from "./types";

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
        // L'aplatissement est en post-ordre : feuilles → racine. Le N1 est le
        // dernier élément (la racine = qui prend l'imprévu).
        const racine = sol.resolutionsAplaties[sol.resolutionsAplaties.length - 1];
        return {
          n1Id: racine.agent.id,
          n1Nom: racine.agent.nom,
          n1Prenom: racine.agent.prenom,
          profondeur: sol.profondeurMax,
          niveauRisque: sol.niveauRisque,
          chaine: sol.resolutionsAplaties.map((r) => ({
            agentNom: r.agent.nom,
            agentPrenom: r.agent.prenom,
            jsCode: r.besoin.jsCible.codeJs,
            jsDate: r.besoin.jsCible.date,
            jsHoraires: `${r.besoin.jsCible.heureDebut}–${r.besoin.jsCible.heureFin}`,
            consequenceType:
              r.besoin.origine.type === "RACINE"
                ? ("RACINE" as const)
                : (r.besoin.origine.consequenceType as ConsequenceType),
          })),
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

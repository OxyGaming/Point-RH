/**
 * Orchestrateur de la simulation multi-JS.
 *
 * Flux :
 *   1. Charger les règles RH
 *   2. Pour chaque JS, trouver les candidats (avec/sans réserve selon scope)
 *   3. Construire le meilleur scénario via l'allocateur greedy
 *   4. Si le mode est "all_agents", construire aussi un scénario "reserve_only" à titre comparatif
 *   5. Si le mode est "reserve_only", construire aussi un scénario "all_agents" à titre comparatif
 *   6. Retourner les scénarios triés
 */

import { loadWorkRules } from "@/lib/rules/workRulesLoader";
import { loadNpoExclusionCodes } from "@/lib/simulation/npoExclusionLoader";
import type { JsCible, FlexibiliteJs } from "@/types/js-simulation";
import type { MultiJsSimulationResultat, CandidateScope } from "@/types/multi-js-simulation";
import { trouverCandidatsPourJs } from "./multiJsCandidateFinder";
import type { AgentDataMultiJs } from "./multiJsCandidateFinder";
import type { MultiJsExclusion } from "@/types/multi-js-simulation";
import { allouerJsMultiple } from "./multiJsAllocator";
import { loadLpaContext } from "@/lib/deplacement/loadLpaContext";
import { computeEffectiveService } from "@/lib/deplacement/computeEffectiveService";
import type { EffectiveServiceInfo } from "@/types/deplacement";
import { createLogger } from "@/engine/logger";

export type { AgentDataMultiJs };

export async function executerSimulationMultiJs(
  jsSelectionnees: JsCible[],
  agents: AgentDataMultiJs[],
  candidateScope: CandidateScope,
  remplacement = true,
  deplacement = false,
  autoriserFigeage = false
): Promise<MultiJsSimulationResultat> {
  const logger = createLogger();

  logger.info("MULTI_SIMULATION_START", {
    data: {
      nbJs: jsSelectionnees.length,
      nbAgents: agents.length,
      candidateScope,
      remplacement,
      deplacement,
      autoriserFigeage,
    },
  });

  const rules = await loadWorkRules();
  const npoExclusionCodes = await loadNpoExclusionCodes();

  // Charger la map JsType → flexibilité uniquement si le figeage est activé.
  // Import dynamique pour isoler la dépendance "server-only" (Prisma) du contexte de test.
  const jsTypeFlexibiliteMap: Map<string, FlexibiliteJs> | undefined = autoriserFigeage
    ? await (await import("@/lib/simulation/jsTypeFlexibiliteLoader")).loadJsTypeFlexibiliteMap()
    : undefined;

  logger.info("FIGEAGE_FLAG_STATE", {
    data: {
      autoriserFigeage,
      jsTypeFlexibiliteMapSize: jsTypeFlexibiliteMap?.size ?? 0,
      nbAgents: agents.length,
      nbJs: jsSelectionnees.length,
    },
  });

  const agentsMap = new Map(agents.map((a) => [a.context.id, a]));

  // ─── Chargement du contexte LPA ──────────────────────────────────────────────
  const agentIds = agents.map((a) => a.context.id);
  const lpaContext = await loadLpaContext(agentIds);

  // ─── Pré-calcul du service effectif par (agent × JS) ─────────────────────────
  // Clé : "${agentId}:${js.planningLigneId}"
  const effectiveServiceMap = new Map<string, EffectiveServiceInfo>();
  for (const { context } of agents) {
    for (const js of jsSelectionnees) {
      if (context.id === js.agentId) continue; // agent source exclu
      const key = `${context.id}:${js.planningLigneId}`;
      const effSvc = computeEffectiveService(
        { id: context.id, lpaBaseId: context.lpaBaseId, peutEtreDeplace: context.peutEtreDeplace },
        {
          codeJs: js.codeJs,
          typeJs: js.typeJs,
          heureDebut: js.heureDebut,
          heureFin: js.heureFin,
          estNuit: js.isNuit,
        },
        lpaContext,
        { remplacement }
      );
      effectiveServiceMap.set(key, effSvc);
    }
  }

  // ─── Fonction utilitaire : construire candidats + scénario pour un scope donné ─
  function construireScenario(scope: CandidateScope, titre: string, description: string) {
    // Collecter candidats ET exclusions structurées pour chaque JS
    const candidatesPerJs = new Map<string, ReturnType<typeof trouverCandidatsPourJs>["candidats"]>();
    const exclusionsPerJs = new Map<string, MultiJsExclusion[]>();

    for (const js of jsSelectionnees) {
      const { candidats, exclusions } = trouverCandidatsPourJs(
        js, agents, scope, rules, remplacement, deplacement, effectiveServiceMap, npoExclusionCodes,
        autoriserFigeage, jsTypeFlexibiliteMap
      );
      candidatesPerJs.set(js.planningLigneId, candidats);
      exclusionsPerJs.set(js.planningLigneId, exclusions);

      logger.info("MULTI_JS_CANDIDATES_BUILT", {
        jsId: js.planningLigneId,
        data: {
          scope,
          codeJs: js.codeJs,
          nbCandidats: candidats.length,
          nbExclusions: exclusions.length,
        },
      });
    }

    const totalExclusions = [...exclusionsPerJs.values()].reduce((s, e) => s + e.length, 0);
    logger.info("MULTI_PREFILTER_DONE", {
      data: {
        scope,
        nbJs: jsSelectionnees.length,
        totalExclusions,
      },
    });

    return allouerJsMultiple(
      jsSelectionnees,
      candidatesPerJs,
      agentsMap,
      rules,
      scope,
      titre,
      description,
      remplacement,
      deplacement,
      effectiveServiceMap,
      npoExclusionCodes,
      exclusionsPerJs,
      lpaContext,  // propagé pour calcul LPA-based dans les cascades
      logger       // traçabilité allocation
    );
  }

  // ─── Scénario principal ───────────────────────────────────────────────────────
  const scenarioPrincipal = construireScenario(
    candidateScope,
    candidateScope === "reserve_only"
      ? "Couverture — Réserve uniquement"
      : "Couverture — Tous agents",
    candidateScope === "reserve_only"
      ? "Simulation limitée aux agents de réserve. Permet d'évaluer la capacité du vivier de réserve à couvrir l'événement."
      : "Simulation ouverte à tous les agents éligibles. Recherche la meilleure couverture globale."
  );

  // ─── Scénario comparatif (scope opposé) ──────────────────────────────────────
  const scopeOppose: CandidateScope =
    candidateScope === "reserve_only" ? "all_agents" : "reserve_only";

  const scenarioComparatif = construireScenario(
    scopeOppose,
    scopeOppose === "reserve_only"
      ? "Comparatif — Réserve uniquement"
      : "Comparatif — Tous agents",
    scopeOppose === "reserve_only"
      ? "Scénario comparatif : couverture si l'on restreint aux agents de réserve."
      : "Scénario comparatif : couverture si l'on ouvre à tous les agents éligibles."
  );

  const scenarios = [scenarioPrincipal, scenarioComparatif].sort(
    (a, b) => b.score - a.score
  );

  const meilleur = scenarios[0] ?? null;

  logger.info("MULTI_SIMULATION_END", {
    data: {
      nbScenarios: scenarios.length,
      meilleurScore: meilleur?.score ?? null,
      meilleurTauxCouverture: meilleur?.tauxCouverture ?? null,
      meilleurNbJsCouvertes: meilleur?.nbJsCouvertes ?? null,
      meilleurRobustesse: meilleur?.robustesse ?? null,
    },
  });

  return {
    jsSelectionnees,
    nbJsSelectionnees: jsSelectionnees.length,
    scenarios,
    scenarioMeilleur: meilleur,
    scenarioReserveOnly:
      candidateScope === "reserve_only"
        ? scenarioPrincipal
        : scenarioComparatif,
    scenarioTousAgents:
      candidateScope === "all_agents"
        ? scenarioPrincipal
        : scenarioComparatif,
    nbAgentsAnalyses: agents.length,
    auditLog: logger.all(),
  };
}

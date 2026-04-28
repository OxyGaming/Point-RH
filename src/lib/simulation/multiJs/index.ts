/**
 * Orchestrateur de la simulation multi-JS.
 *
 * Calcule toujours les 4 scénarios en parallèle :
 *   – Réserve uniquement, sans figeage
 *   – Réserve uniquement, avec figeage DERNIER_RECOURS
 *   – Tous agents, sans figeage
 *   – Tous agents, avec figeage DERNIER_RECOURS
 */

import { loadWorkRules } from "@/lib/rules/workRulesLoader";
import { loadNpoExclusionCodes } from "@/lib/simulation/npoExclusionLoader";
import { loadZeroLoadPrefixes } from "@/lib/simulation/zeroLoadPrefixLoader";
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
  _candidateScope: CandidateScope = "reserve_only", // conservé pour compatibilité, ignoré
  remplacement = true,
  deplacement = false,
  _autoriserFigeage = false // conservé pour compatibilité, ignoré
): Promise<MultiJsSimulationResultat> {
  const logger = createLogger();

  logger.info("MULTI_SIMULATION_START", {
    data: { nbJs: jsSelectionnees.length, nbAgents: agents.length, remplacement, deplacement },
  });

  const rules = await loadWorkRules();
  const npoExclusionCodes = await loadNpoExclusionCodes();
  const zeroLoadPrefixes = await loadZeroLoadPrefixes();

  // Toujours charger la map de flexibilité pour les scénarios avec figeage
  const jsTypeFlexibiliteMap: Map<string, FlexibiliteJs> =
    await (await import("@/lib/simulation/jsTypeFlexibiliteLoader")).loadJsTypeFlexibiliteMap();

  const agentsMap = new Map(agents.map((a) => [a.context.id, a]));

  const agentIds = agents.map((a) => a.context.id);
  const lpaContext = await loadLpaContext(agentIds);

  // Pré-calcul du service effectif (partagé entre tous les scénarios)
  const effectiveServiceMap = new Map<string, EffectiveServiceInfo>();
  for (const { context } of agents) {
    for (const js of jsSelectionnees) {
      if (context.id === js.agentId) continue;
      const key = `${context.id}:${js.planningLigneId}`;
      effectiveServiceMap.set(
        key,
        computeEffectiveService(
          { id: context.id, lpaBaseId: context.lpaBaseId, peutEtreDeplace: context.peutEtreDeplace },
          { codeJs: js.codeJs, typeJs: js.typeJs, heureDebut: js.heureDebutJsType ?? js.heureDebut, heureFin: js.heureFinJsType ?? js.heureFin, estNuit: js.isNuit },
          lpaContext,
          { remplacement }
        )
      );
    }
  }

  // ─── Constructeur de scénario paramétrable ────────────────────────────────────
  function construireScenario(
    scope: CandidateScope,
    avecFigeage: boolean,
    titre: string,
    description: string
  ) {
    const candidatesPerJs = new Map<string, ReturnType<typeof trouverCandidatsPourJs>["candidats"]>();
    const exclusionsPerJs = new Map<string, MultiJsExclusion[]>();

    for (const js of jsSelectionnees) {
      const { candidats, exclusions } = trouverCandidatsPourJs(
        js, agents, scope, rules, remplacement, deplacement,
        effectiveServiceMap, npoExclusionCodes,
        avecFigeage, avecFigeage ? jsTypeFlexibiliteMap : undefined,
        zeroLoadPrefixes
      );
      candidatesPerJs.set(js.planningLigneId, candidats);
      exclusionsPerJs.set(js.planningLigneId, exclusions);
    }

    return allouerJsMultiple(
      jsSelectionnees, candidatesPerJs, agentsMap, rules, scope,
      titre, description, remplacement, deplacement,
      effectiveServiceMap, npoExclusionCodes, exclusionsPerJs, lpaContext, logger,
      zeroLoadPrefixes
    );
  }

  // ─── 4 scénarios ─────────────────────────────────────────────────────────────
  const scenarioReserveOnly = construireScenario(
    "reserve_only", false,
    "Réserve — Direct",
    "Couverture limitée aux agents de réserve, sans figeage."
  );
  const scenarioReserveOnlyFigeage = construireScenario(
    "reserve_only", true,
    "Réserve + Figeage",
    "Couverture réserve avec libération des agents sur JS DERNIER_RECOURS."
  );
  const scenarioTousAgents = construireScenario(
    "all_agents", false,
    "Tous agents — Direct",
    "Couverture ouverte à tous les agents éligibles, sans figeage."
  );
  const scenarioTousAgentsFigeage = construireScenario(
    "all_agents", true,
    "Tous agents + Figeage",
    "Couverture maximale : tous agents + libération DERNIER_RECOURS."
  );

  const scenarios = [
    scenarioReserveOnly,
    scenarioReserveOnlyFigeage,
    scenarioTousAgents,
    scenarioTousAgentsFigeage,
  ].sort((a, b) => b.score - a.score);

  const meilleur = scenarios[0] ?? null;

  logger.info("MULTI_SIMULATION_END", {
    data: {
      nbScenarios: scenarios.length,
      meilleurScore: meilleur?.score ?? null,
      meilleurTauxCouverture: meilleur?.tauxCouverture ?? null,
    },
  });

  return {
    jsSelectionnees,
    nbJsSelectionnees: jsSelectionnees.length,
    scenarios,
    scenarioMeilleur: meilleur,
    scenarioReserveOnly,
    scenarioReserveOnlyFigeage,
    scenarioTousAgents,
    scenarioTousAgentsFigeage,
    nbAgentsAnalyses: agents.length,
    auditLog: logger.all(),
  };
}

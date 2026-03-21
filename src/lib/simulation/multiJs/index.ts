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
import type { JsCible } from "@/types/js-simulation";
import type { MultiJsSimulationResultat, CandidateScope } from "@/types/multi-js-simulation";
import { trouverCandidatsPourJs } from "./multiJsCandidateFinder";
import type { AgentDataMultiJs } from "./multiJsCandidateFinder";
import { allouerJsMultiple } from "./multiJsAllocator";

export type { AgentDataMultiJs };

export async function executerSimulationMultiJs(
  jsSelectionnees: JsCible[],
  agents: AgentDataMultiJs[],
  candidateScope: CandidateScope,
  remplacement = true,
  deplacement = false
): Promise<MultiJsSimulationResultat> {
  const rules = await loadWorkRules();

  const agentsMap = new Map(agents.map((a) => [a.context.id, a]));

  // ─── Fonction utilitaire : construire candidats + scénario pour un scope donné ─
  function construireScenario(scope: CandidateScope, titre: string, description: string) {
    // Construire la map candidats pour chaque JS avec ce scope
    const candidatesPerJs = new Map(
      jsSelectionnees.map((js) => [
        js.planningLigneId,
        trouverCandidatsPourJs(js, agents, scope, rules, remplacement, deplacement),
      ])
    );

    return allouerJsMultiple(
      jsSelectionnees,
      candidatesPerJs,
      agentsMap,
      rules,
      scope,
      titre,
      description,
      remplacement,
      deplacement
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

  return {
    jsSelectionnees,
    nbJsSelectionnees: jsSelectionnees.length,
    scenarios,
    scenarioMeilleur: scenarios[0] ?? null,
    scenarioReserveOnly:
      candidateScope === "reserve_only"
        ? scenarioPrincipal
        : scenarioComparatif,
    scenarioTousAgents:
      candidateScope === "all_agents"
        ? scenarioPrincipal
        : scenarioComparatif,
    nbAgentsAnalyses: agents.length,
  };
}

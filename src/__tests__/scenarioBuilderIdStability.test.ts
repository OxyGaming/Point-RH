/**
 * Test de régression — unicité des IDs de scénarios entre passes successives.
 *
 * Bug historique : `let scenarioCounter = 0;` au niveau module dans
 * scenarioBuilder.ts, réinitialisé à 0 au début de `construireScenarios`.
 * Conséquence : la passe "sansFigeage" et la passe "avecFigeage" du single-JS
 * (toutes deux invoquaient construireScenarios depuis executerSimulationJS)
 * produisaient des IDs identiques (`scenario-1`, `scenario-2`…).
 *
 * Ce test vérifie qu'après refactor sur generateScenarioId, deux invocations
 * consécutives produisent des IDs disjoints.
 */

import { construireScenarios } from "@/lib/simulation/scenarioBuilder";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type {
  CandidatResult,
  JsCible,
  ImpreuvuConfig,
} from "@/types/js-simulation";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";

function makeJsCible(): JsCible {
  return {
    planningLigneId: "ligne-cible",
    agentId: "agent-initial",
    agentNom: "Martin",
    agentPrenom: "Paul",
    agentMatricule: "M000",
    date: "2025-06-10",
    heureDebut: "08:00",
    heureFin: "16:00",
    amplitudeMin: 480,
    codeJs: "GIV001",
    typeJs: "GIV",
    isNuit: false,
    importId: "import-1",
    flexibilite: "OBLIGATOIRE",
  };
}

function makeImprevu(): ImpreuvuConfig {
  return {
    partiel: false,
    heureDebutReel: "08:00",
    heureFinEstimee: "16:00",
    deplacement: false,
    remplacement: false,
  };
}

function makeCandidatDirect(agentId: string): CandidatResult {
  return {
    agentId,
    nom: "Dupont",
    prenom: "Alice",
    matricule: `M${agentId}`,
    posteAffectation: null,
    agentReserve: false,
    surJsZ: false,
    codeJsZOrigine: null,
    statut: "DIRECT",
    scorePertinence: 80,
    scoreBreakdown: {
      base: 100,
      penaliteViolations: 0,
      penaliteConflits: 0,
      bonusReserve: 0,
      bonusJsZ: 0,
      penaliteMargeRepos: 0,
      penaliteGpt: 0,
      total: 80,
    },
    motifPrincipal: "Disponible",
    detail: {
      amplitudeMaxAutorisee: 660,
      amplitudeImprevu: 480,
      dureeEffectiveMax: 480,
      reposJournalierMin: 720,
      dernierPosteDebut: null,
      dernierPosteFin: null,
      reposJournalierDisponible: null,
      gptActuel: 3,
      gptMax: 6,
      reposPeriodiqueProchain: null,
      violations: [],
      respectees: [],
      pointsVigilance: [],
      disponible: true,
      deplacementInfo: null,
      amplitudeRaison: "cas général",
      dernierPosteDate: null,
      teGptCumulAvant: 0,
      teGptLignes: [],
      gptRpAnalyse: null,
    },
    conflitsInduits: [],
    nbConflits: 0,
    jsSourceFigee: null,
  };
}

describe("scenarioBuilder — unicité des IDs entre passes successives", () => {
  const jsCible = makeJsCible();
  const imprevu = makeImprevu();
  const tousAgents: { context: AgentContext; events: PlanningEvent[] }[] = [];

  it("deux appels consécutifs avec les mêmes inputs produisent des IDs disjoints", () => {
    // Simule la séquence executerSimulationJS : passes sansFigeage puis avecFigeage,
    // toutes deux invoquant construireScenarios sur des candidats équivalents.
    const passe1 = construireScenarios(
      [makeCandidatDirect("a1")],
      jsCible,
      imprevu,
      tousAgents,
      undefined,
      DEFAULT_WORK_RULES_MINUTES
    );
    const passe2 = construireScenarios(
      [makeCandidatDirect("a1")],
      jsCible,
      imprevu,
      tousAgents,
      undefined,
      DEFAULT_WORK_RULES_MINUTES
    );

    expect(passe1).toHaveLength(1);
    expect(passe2).toHaveLength(1);
    expect(passe1[0].id).not.toBe(passe2[0].id);
  });

  it("plusieurs candidats dans une même passe produisent des IDs distincts", () => {
    const candidats = [
      makeCandidatDirect("a1"),
      makeCandidatDirect("a2"),
    ];
    const scenarios = construireScenarios(
      candidats,
      jsCible,
      imprevu,
      tousAgents,
      undefined,
      DEFAULT_WORK_RULES_MINUTES
    );
    const ids = new Set(scenarios.map((s) => s.id));
    expect(ids.size).toBe(scenarios.length);
  });

  it("le format d'ID respecte la convention scenario-<token>", () => {
    const scenarios = construireScenarios(
      [makeCandidatDirect("a1")],
      jsCible,
      imprevu,
      tousAgents,
      undefined,
      DEFAULT_WORK_RULES_MINUTES
    );
    expect(scenarios[0].id).toMatch(/^scenario-[0-9a-z]+-[0-9a-z]{1,5}$/);
  });
});

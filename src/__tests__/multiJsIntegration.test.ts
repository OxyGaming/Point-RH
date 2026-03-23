/**
 * Tests d'intégration — executerSimulationMultiJs
 *
 * Couvre :
 *  - scenarioMeilleur non null
 *  - scenarios (2 scénarios produits)
 *  - exclusionsParJs présentes et structurées
 *  - jsNonCouvertes si aucun candidat
 *  - auditLog présent et non vide
 *  - IDs de scénario distincts entre les deux scénarios
 */

// ─── Mocks des loaders serveur ─────────────────────────────────────────────
//
// Ces modules utilisent Prisma / server-only et ne peuvent pas être exécutés
// dans Jest directement. On les remplace par des valeurs de test sûres.

import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";

jest.mock("@/lib/rules/workRulesLoader", () => ({
  loadWorkRules: jest.fn().mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("@/lib/rules/workRules").DEFAULT_WORK_RULES_MINUTES
  ),
}));

jest.mock("@/lib/simulation/npoExclusionLoader", () => ({
  loadNpoExclusionCodes: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/deplacement/loadLpaContext", () => ({
  loadLpaContext: jest.fn().mockResolvedValue({
    lpas: [],
    jsTypes: [],
    agentRulesMap: new Map(),
  }),
}));

// ─── Imports après mocks ───────────────────────────────────────────────────

import { executerSimulationMultiJs } from "@/lib/simulation/multiJs";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { JsCible } from "@/types/js-simulation";
import type { PlanningEvent } from "@/engine/rules";

// ─── Builders ─────────────────────────────────────────────────────────────────

function makeJs(
  id: string,
  date: string,
  heureDebut: string,
  heureFin: string,
  codeJs = "GIV001"
): JsCible {
  return {
    planningLigneId: id,
    agentId: "agent-source",
    agentNom: "Source",
    agentPrenom: "Agent",
    agentMatricule: "SRC",
    date,
    heureDebut,
    heureFin,
    amplitudeMin: 480,
    codeJs,
    typeJs: null,
    isNuit: false,
    importId: "import-test",
    flexibilite: "OBLIGATOIRE" as const,
  };
}

function makeAgent(
  id: string,
  overrides: Partial<AgentDataMultiJs["context"]> = {},
  events: PlanningEvent[] = []
): AgentDataMultiJs {
  return {
    context: {
      id,
      nom: `Agent${id}`,
      prenom: "Test",
      matricule: `M${id}`,
      posteAffectation: "GARE-A",
      agentReserve: false,
      peutFaireNuit: true,
      peutEtreDeplace: true,
      regimeB: false,
      regimeC: false,
      prefixesJs: ["GIV"],
      lpaBaseId: null,
      ...overrides,
    },
    events,
  };
}

// ─── 1. Couverture complète ────────────────────────────────────────────────────

describe("executerSimulationMultiJs — couverture complète", () => {
  it("2 JS, 2 agents éligibles → scenarioMeilleur avec couverture 100%", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "06:00", "14:00");
    const js2 = makeJs("js-2", "2024-03-21", "08:00", "16:00");
    const agent1 = makeAgent("a1");
    const agent2 = makeAgent("a2");

    const result = await executerSimulationMultiJs(
      [js1, js2],
      [agent1, agent2],
      "all_agents"
    );

    expect(result.scenarioMeilleur).not.toBeNull();
    expect(result.scenarioMeilleur!.nbJsCouvertes).toBe(2);
    expect(result.scenarioMeilleur!.tauxCouverture).toBe(100);
    expect(result.scenarioMeilleur!.jsNonCouvertes).toHaveLength(0);
  });

  it("deux scénarios toujours produits (principal + comparatif)", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00");
    const agent1 = makeAgent("a1");

    const result = await executerSimulationMultiJs([js1], [agent1], "all_agents");

    expect(result.scenarios).toHaveLength(2);
    expect(result.scenarios[0].score).toBeGreaterThanOrEqual(result.scenarios[1].score);
  });

  it("IDs de scénario distincts entre le principal et le comparatif", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00");
    const agent1 = makeAgent("a1");

    const result = await executerSimulationMultiJs([js1], [agent1], "all_agents");

    expect(result.scenarios[0].id).not.toBe(result.scenarios[1].id);
    expect(result.scenarios[0].id).toMatch(/^scenario-/);
    expect(result.scenarios[1].id).toMatch(/^scenario-/);
  });
});

// ─── 2. JS non couverte ───────────────────────────────────────────────────────

describe("executerSimulationMultiJs — JS non couverte", () => {
  it("agent avec préfixe VEN ne peut pas couvrir JS GIV001 → jsNonCouvertes", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00", "GIV001");
    const agentMauvaisPrefixe = makeAgent("a1", { prefixesJs: ["VEN"] });

    const result = await executerSimulationMultiJs(
      [js1],
      [agentMauvaisPrefixe],
      "all_agents"
    );

    expect(result.scenarioMeilleur!.nbJsCouvertes).toBe(0);
    expect(result.scenarioMeilleur!.jsNonCouvertes).toHaveLength(1);
    expect(result.scenarioMeilleur!.jsNonCouvertes[0].planningLigneId).toBe("js-1");
  });
});

// ─── 3. exclusionsParJs ───────────────────────────────────────────────────────

describe("executerSimulationMultiJs — exclusionsParJs", () => {
  it("exclusionsParJs présentes dans le scénario meilleur", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00", "GIV001");
    const agentOk = makeAgent("a-ok", { prefixesJs: ["GIV"] });
    const agentExclu = makeAgent("a-exclu", { prefixesJs: ["VEN"] }); // PREFIXE_JS

    const result = await executerSimulationMultiJs(
      [js1],
      [agentOk, agentExclu],
      "all_agents"
    );

    const excls = result.scenarioMeilleur!.exclusionsParJs;
    expect(excls).toHaveLength(1);
    expect(excls[0].jsId).toBe("js-1");
    expect(excls[0].date).toBe("2024-03-20");
    expect(excls[0].heureDebut).toBe("08:00");
    expect(excls[0].heureFin).toBe("16:00");

    // L'agent avec mauvais préfixe doit être dans les exclusions
    const exclPrefixe = excls[0].exclusions.find(e => e.regle === "PREFIXE_JS");
    expect(exclPrefixe).toBeDefined();
    expect(exclPrefixe?.agentId).toBe("a-exclu");
    expect(exclPrefixe?.agentNom).toBe("Agenta-exclu");
    expect(exclPrefixe?.agentMatricule).toBe("Ma-exclu");
  });

  it("agent source (agentId === js.agentId) absent des exclusions", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00");
    // agentSource a le même ID que js.agentId = "agent-source"
    const agentSource = makeAgent("agent-source");
    const agentOk = makeAgent("a-ok");

    const result = await executerSimulationMultiJs(
      [js1],
      [agentSource, agentOk],
      "all_agents"
    );

    const excls = result.scenarioMeilleur!.exclusionsParJs[0].exclusions;
    // agentSource ne doit PAS être dans les exclusions (ignoré silencieusement)
    expect(excls.find(e => e.agentId === "agent-source")).toBeUndefined();
  });
});

// ─── 4. auditLog ──────────────────────────────────────────────────────────────

describe("executerSimulationMultiJs — auditLog", () => {
  it("auditLog présent et non vide", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00");
    const agent1 = makeAgent("a1");

    const result = await executerSimulationMultiJs([js1], [agent1], "all_agents");

    expect(result.auditLog).toBeDefined();
    expect(result.auditLog.length).toBeGreaterThan(0);
  });

  it("MULTI_SIMULATION_START est le premier événement du log", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00");
    const agent1 = makeAgent("a1");

    const result = await executerSimulationMultiJs([js1], [agent1], "all_agents");

    expect(result.auditLog[0].event).toBe("MULTI_SIMULATION_START");
  });

  it("MULTI_SIMULATION_END est le dernier événement du log", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00");
    const agent1 = makeAgent("a1");

    const result = await executerSimulationMultiJs([js1], [agent1], "all_agents");

    const last = result.auditLog[result.auditLog.length - 1];
    expect(last.event).toBe("MULTI_SIMULATION_END");
  });

  it("log contient MULTI_PREFILTER_DONE et MULTI_JS_CANDIDATES_BUILT", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00");
    const agent1 = makeAgent("a1");

    const result = await executerSimulationMultiJs([js1], [agent1], "all_agents");

    const events = result.auditLog.map(e => e.event);
    expect(events).toContain("MULTI_JS_CANDIDATES_BUILT");
    expect(events).toContain("MULTI_PREFILTER_DONE");
  });

  it("MULTI_ASSIGNMENT_DONE émis si une JS est couverte", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00");
    const agent1 = makeAgent("a1");

    const result = await executerSimulationMultiJs([js1], [agent1], "all_agents");

    // Au moins un scénario couvre la JS → MULTI_ASSIGNMENT_DONE dans le log
    const assignEvents = result.auditLog.filter(e => e.event === "MULTI_ASSIGNMENT_DONE");
    // 2 scénarios construits (principal + comparatif)
    // Dans le scénario all_agents : la JS est couverte → 1 ASSIGNMENT_DONE attendu par scénario
    expect(assignEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("MULTI_JS_NOT_COVERED émis si JS non couverte", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00", "GIV001");
    const agentExclu = makeAgent("a1", { prefixesJs: ["VEN"] }); // ne peut pas faire GIV001

    const result = await executerSimulationMultiJs([js1], [agentExclu], "all_agents");

    const notCoveredEvents = result.auditLog.filter(e => e.event === "MULTI_JS_NOT_COVERED");
    expect(notCoveredEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("chaque entrée du log a un timestamp ISO valide", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00");
    const agent1 = makeAgent("a1");

    const result = await executerSimulationMultiJs([js1], [agent1], "all_agents");

    for (const entry of result.auditLog) {
      expect(() => new Date(entry.ts).toISOString()).not.toThrow();
      expect(new Date(entry.ts).getFullYear()).toBeGreaterThan(2000);
    }
  });
});

// ─── 5. nbAgentsAnalyses ─────────────────────────────────────────────────────

describe("executerSimulationMultiJs — nbAgentsAnalyses", () => {
  it("nbAgentsAnalyses = nombre total d'agents passés en paramètre", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00");
    const agents = [makeAgent("a1"), makeAgent("a2"), makeAgent("a3")];

    const result = await executerSimulationMultiJs([js1], agents, "all_agents");

    expect(result.nbAgentsAnalyses).toBe(3);
    expect(result.nbJsSelectionnees).toBe(1);
  });
});

// ─── 6. Scope reserve_only ───────────────────────────────────────────────────

describe("executerSimulationMultiJs — scope reserve_only", () => {
  it("scope reserve_only exclut les agents non réserve", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "08:00", "16:00");
    const agentReserve = makeAgent("a-res", { agentReserve: true });
    const agentNormal = makeAgent("a-norm", { agentReserve: false });

    const result = await executerSimulationMultiJs(
      [js1],
      [agentReserve, agentNormal],
      "reserve_only"
    );

    // Le scénario principal est reserve_only → seul agentReserve éligible
    expect(result.scenarioReserveOnly).not.toBeNull();
    const excls = result.scenarioReserveOnly!.exclusionsParJs[0].exclusions;
    // agentNormal exclu par SCOPE_RESERVE
    const scopeExcl = excls.find(e => e.regle === "SCOPE_RESERVE");
    expect(scopeExcl).toBeDefined();
    expect(scopeExcl?.agentId).toBe("a-norm");
  });
});

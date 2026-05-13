/**
 * Tests d'unicité de l'émission du shadow report multi-JS (P3).
 *
 * Avant P3 : runShadowComparison était appelé une fois PAR scénario cascade
 * (4 scénarios) → 4 entrées UNIFIED_SHADOW_REPORT dans auditLog.
 *
 * Après P3 : un seul appel par run multi-JS — le meilleur scénario cascade
 * sert de référence legacy. Le rapport est exposé au niveau résultat global
 * (resultat.unifiedReport) et non plus sur chaque scénario.
 */

// ─── Mocks des loaders serveur ─────────────────────────────────────────────

jest.mock("@/lib/rules/workRulesLoader", () => ({
  loadWorkRules: jest.fn().mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/lib/rules/workRules").DEFAULT_WORK_RULES_MINUTES,
  ),
}));
jest.mock("@/lib/simulation/npoExclusionLoader", () => ({
  loadNpoExclusionCodes: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/lib/simulation/jsTypeFlexibiliteLoader", () => ({
  loadJsTypeFlexibiliteMap: jest.fn().mockResolvedValue(new Map()),
}));
jest.mock("@/lib/simulation/zeroLoadPrefixLoader", () => ({
  loadZeroLoadPrefixes: jest.fn().mockResolvedValue([]),
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
import { _resetUnifiedFlagWarnForTests } from "@/lib/simulation/unified/featureFlag";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJs(id: string, date: string, heureDebut: string, heureFin: string): JsCible {
  return {
    planningLigneId: id,
    agentId:        "agent-source",
    agentNom:       "Source",
    agentPrenom:    "Agent",
    agentMatricule: "SRC",
    date,
    heureDebut,
    heureFin,
    amplitudeMin:   480,
    codeJs:         "GIV001",
    typeJs:         null,
    isNuit:         false,
    importId:       "import-test",
    flexibilite:    "OBLIGATOIRE",
  };
}

function makeAgent(id: string): AgentDataMultiJs {
  return {
    context: {
      id,
      nom:              `Agent${id}`,
      prenom:           "Test",
      matricule:        `M${id}`,
      posteAffectation: "GARE-A",
      agentReserve:     true, // scope reserve OK + scope all OK
      peutFaireNuit:    true,
      peutEtreDeplace:  true,
      regimeB:          false,
      regimeC:          false,
      prefixesJs:       ["GIV"],
      lpaBaseId:        null,
    },
    events: [],
  };
}

// ─── Gestion de l'env shadow ──────────────────────────────────────────────────

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  _resetUnifiedFlagWarnForTests();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("executerSimulationMultiJs — shadow report unique (P3)", () => {
  it("UNIFIED_SHADOW=1 : exactement 1 entrée UNIFIED_SHADOW_REPORT dans auditLog (vs 4 avant P3)", async () => {
    process.env.UNIFIED_SHADOW = "1";
    delete process.env.FEATURE_UNIFIED_PRIMARY;
    delete process.env.UNIFIED_PRIMARY_ALIGNMENT_DONE;

    const js1 = makeJs("js-1", "2024-03-20", "06:00", "14:00");
    const js2 = makeJs("js-2", "2024-03-21", "08:00", "16:00");

    const resultat = await executerSimulationMultiJs(
      [js1, js2],
      [makeAgent("a1"), makeAgent("a2"), makeAgent("a3")],
      "all_agents",
    );

    const shadowEntries = resultat.auditLog.filter(
      (e) => e.event === "UNIFIED_SHADOW_REPORT",
    );
    expect(shadowEntries).toHaveLength(1);
  });

  it("UNIFIED_SHADOW unset : aucune entrée UNIFIED_SHADOW_REPORT", async () => {
    delete process.env.UNIFIED_SHADOW;
    delete process.env.FEATURE_UNIFIED_PRIMARY;

    const js1 = makeJs("js-1", "2024-03-20", "06:00", "14:00");

    const resultat = await executerSimulationMultiJs(
      [js1],
      [makeAgent("a1"), makeAgent("a2")],
      "all_agents",
    );

    const shadowEntries = resultat.auditLog.filter(
      (e) => e.event === "UNIFIED_SHADOW_REPORT",
    );
    expect(shadowEntries).toHaveLength(0);
    expect(resultat.unifiedReport).toBeUndefined();
  });

  it("FEATURE_UNIFIED_PRIMARY=1 + alignment : 1 entrée et resultat.unifiedReport exposé au niveau global", async () => {
    process.env.FEATURE_UNIFIED_PRIMARY = "1";
    process.env.UNIFIED_PRIMARY_ALIGNMENT_DONE = "1";
    delete process.env.UNIFIED_SHADOW;

    const js1 = makeJs("js-1", "2024-03-20", "06:00", "14:00");
    const js2 = makeJs("js-2", "2024-03-21", "08:00", "16:00");

    const resultat = await executerSimulationMultiJs(
      [js1, js2],
      [makeAgent("a1"), makeAgent("a2")],
      "all_agents",
    );

    const shadowEntries = resultat.auditLog.filter(
      (e) => e.event === "UNIFIED_SHADOW_REPORT",
    );
    expect(shadowEntries).toHaveLength(1);
    expect(resultat.unifiedReport).toBeDefined();
    expect(resultat.unifiedReport!.jsAnalyses.length).toBe(2);
  });

  it("aucun scenario ne porte de unifiedReport (champ déplacé au niveau global)", async () => {
    process.env.FEATURE_UNIFIED_PRIMARY = "1";
    process.env.UNIFIED_PRIMARY_ALIGNMENT_DONE = "1";

    const js1 = makeJs("js-1", "2024-03-20", "06:00", "14:00");

    const resultat = await executerSimulationMultiJs(
      [js1],
      [makeAgent("a1")],
      "all_agents",
    );

    // Type-level check : `unifiedReport` n'est plus une propriété de
    // MultiJsScenario. À runtime, aucun scénario ne doit l'exposer.
    for (const s of resultat.scenarios) {
      expect((s as unknown as Record<string, unknown>).unifiedReport).toBeUndefined();
    }
  });
});

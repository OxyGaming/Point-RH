/**
 * Tests ciblés — Phase 3 : figeage dans le moteur multi-JS
 *
 * Couvre :
 *  - Tri des JS cibles : OBLIGATOIRE avant DERNIER_RECOURS
 *  - Candidat libéré par figeage (JS source DERNIER_RECOURS)
 *  - Refus de figeage sur JS source OBLIGATOIRE
 *  - Absence de figeage si autoriserFigeage = false
 *  - Pénalité différenciée JS non couverte (OBLIGATOIRE > DERNIER_RECOURS)
 *  - Remplissage correct de solution et jsSourceFigee dans AffectationJs
 *  - Non-régression : comportement identique sans figeage
 */

import { trouverCandidatsPourJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import { allouerJsMultiple } from "@/lib/simulation/multiJs/multiJsAllocator";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";
import { POIDS_SCORE_SCENARIO_MULTI } from "@/lib/simulation/scenarioScorer";
import type { JsCible, FlexibiliteJs, JsSourceFigee } from "@/types/js-simulation";
import type { CandidatMultiJs, MultiJsExclusion } from "@/types/multi-js-simulation";
import type { PlanningEvent } from "@/engine/rules";

const rules = DEFAULT_WORK_RULES_MINUTES;

// ─── Builders ─────────────────────────────────────────────────────────────────

function makeDate(dateStr: string, heure: string): Date {
  const [h, m] = heure.split(":").map(Number);
  const d = new Date(dateStr);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

function makeJs(
  id: string,
  overrides: Partial<JsCible> = {}
): JsCible {
  return {
    planningLigneId: id,
    agentId: "agent-source",
    agentNom: "Source",
    agentPrenom: "Agent",
    agentMatricule: "SRC",
    date: "2025-06-10",
    heureDebut: "08:00",
    heureFin: "16:00",
    amplitudeMin: 480,
    codeJs: "GIV001",
    typeJs: "GIV",
    isNuit: false,
    importId: "import-1",
    flexibilite: "OBLIGATOIRE" as const,
    ...overrides,
  };
}

function makeAgent(
  id: string,
  events: PlanningEvent[] = [],
  overrides: Partial<AgentDataMultiJs["context"]> = {}
): AgentDataMultiJs {
  return {
    context: {
      id,
      nom: `Dupont${id}`,
      prenom: "Alice",
      matricule: `M${id}`,
      posteAffectation: "GARE-A",
      agentReserve: false,
      peutFaireNuit: true,
      peutEtreDeplace: false,
      regimeB: false,
      regimeC: false,
      prefixesJs: ["GIV"],
      lpaBaseId: null,
      ...overrides,
    },
    events,
  };
}

function makeConflictEvent(planningLigneId?: string): PlanningEvent {
  return {
    dateDebut: makeDate("2025-06-10", "08:00"),
    dateFin:   makeDate("2025-06-10", "16:00"),
    heureDebut: "08:00",
    heureFin:   "16:00",
    amplitudeMin: 480,
    dureeEffectiveMin: null,
    jsNpo: "JS",
    codeJs: "GIV002",
    typeJs: null,
    planningLigneId,
  };
}

function makeCandidat(
  agentId: string,
  statut: "DIRECT" | "VIGILANCE" = "DIRECT",
  score = 90,
  jsSourceFigee: JsSourceFigee | null = null
): CandidatMultiJs {
  return {
    agentId,
    nom: `Agent${agentId}`,
    prenom: "Test",
    matricule: `M${agentId}`,
    posteAffectation: "GARE-A",
    agentReserve: false,
    score,
    statut,
    motif: "Règles respectées",
    conflitsInduits: [],
    jsSourceFigee,
  };
}

function makeAgentMap(...agents: AgentDataMultiJs[]) {
  return new Map(agents.map((a) => [a.context.id, a]));
}

function buildScenario(
  jsCibles: JsCible[],
  candidatesPerJs: Map<string, CandidatMultiJs[]>,
  agentsMap: Map<string, AgentDataMultiJs>,
  exclusionsPerJs: Map<string, MultiJsExclusion[]> = new Map()
) {
  return allouerJsMultiple(
    jsCibles,
    candidatesPerJs,
    agentsMap,
    rules,
    "all_agents",
    "Test",
    "Test scenario",
    true,
    false,
    undefined,
    [],
    exclusionsPerJs
  );
}

// ─── 1. Tri des JS cibles par flexibilité ────────────────────────────────────

describe("Tri JS cibles par flexibilité", () => {
  it("une JS OBLIGATOIRE est traitée avant une JS DERNIER_RECOURS même si elle a plus de candidats", () => {
    const jsOblig  = makeJs("js-oblig",  { flexibilite: "OBLIGATOIRE" });
    const jsDR     = makeJs("js-dr",     { flexibilite: "DERNIER_RECOURS", codeJs: "GIV002" });
    const agent1   = makeAgent("a1");
    const agent2   = makeAgent("a2");

    // jsOblig a 2 candidats, jsDR en a 1 → sans tri flexibilité, jsDR serait traitée en premier
    const candidatesPerJs = new Map([
      ["js-oblig", [makeCandidat("a1"), makeCandidat("a2")]],
      ["js-dr",    [makeCandidat("a1")]],
    ]);
    const agentsMap = makeAgentMap(agent1, agent2);

    const scenario = buildScenario([jsOblig, jsDR], candidatesPerJs, agentsMap);

    // Les deux JS doivent être couvertes
    expect(scenario.nbJsCouvertes).toBe(2);
    // js-oblig doit être couverte (priorité flexibilité garantit ça)
    const affOblig = scenario.affectations.find((a) => a.jsId === "js-oblig");
    expect(affOblig).toBeDefined();
  });

  it("DERNIER_RECOURS non couverte n'empêche pas la couverture de OBLIGATOIRE", () => {
    const jsOblig = makeJs("js-oblig", { flexibilite: "OBLIGATOIRE" });
    const jsDR    = makeJs("js-dr",   { flexibilite: "DERNIER_RECOURS" });
    const agent1  = makeAgent("a1");

    // Un seul agent : peut couvrir jsOblig ou jsDR, mais pas les deux
    const candidatesPerJs = new Map([
      ["js-oblig", [makeCandidat("a1")]],
      ["js-dr",    [makeCandidat("a1")]],
    ]);
    const agentsMap = makeAgentMap(agent1);

    const scenario = buildScenario([jsOblig, jsDR], candidatesPerJs, agentsMap);

    // js-oblig doit être couverte, js-dr non (agent déjà utilisé)
    expect(scenario.affectations.find((a) => a.jsId === "js-oblig")).toBeDefined();
    expect(scenario.jsNonCouvertes.find((j) => j.planningLigneId === "js-dr")).toBeDefined();
  });
});

// ─── 2. Candidat libéré par figeage (via trouverCandidatsPourJs) ─────────────

describe("trouverCandidatsPourJs — figeage autorisé", () => {
  const js = makeJs("js-001");
  const mapDR = new Map<string, FlexibiliteJs>([["GIV002", "DERNIER_RECOURS"]]);

  it("retourne un candidat avec jsSourceFigee si JS source est DERNIER_RECOURS et figeage autorisé", () => {
    const conflitEvent = makeConflictEvent("ligne-giv002");
    const agent = makeAgent("a1", [conflitEvent]);

    const { candidats, exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules, true, false, undefined, [], true, mapDR
    );

    expect(candidats).toHaveLength(1);
    expect(candidats[0].agentId).toBe("a1");
    expect(candidats[0].jsSourceFigee).not.toBeNull();
    expect(candidats[0].jsSourceFigee?.codeJs).toBe("GIV002");
    expect(candidats[0].jsSourceFigee?.flexibilite).toBe("DERNIER_RECOURS");
    expect(candidats[0].jsSourceFigee?.planningLigneId).toBe("ligne-giv002");
    // Agent libéré par figeage → NE doit PAS apparaître dans les exclusions CONFLIT_HORAIRE
    expect(exclusions.find((e) => e.regle === "CONFLIT_HORAIRE")).toBeUndefined();
  });

  it("exclut l'agent avec CONFLIT_HORAIRE si figeage non autorisé", () => {
    const agent = makeAgent("a1", [makeConflictEvent()]);

    const { candidats, exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules, true, false, undefined, [], false, mapDR
    );

    expect(candidats).toHaveLength(0);
    expect(exclusions.find((e) => e.regle === "CONFLIT_HORAIRE")).toBeDefined();
  });

  it("exclut l'agent si JS source est OBLIGATOIRE même avec figeage autorisé", () => {
    const conflitEvent = makeConflictEvent();
    const agent = makeAgent("a1", [conflitEvent]);
    const mapOblig = new Map<string, FlexibiliteJs>([["GIV002", "OBLIGATOIRE"]]);

    const { candidats, exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules, true, false, undefined, [], true, mapOblig
    );

    expect(candidats).toHaveLength(0);
    expect(exclusions.find((e) => e.regle === "CONFLIT_HORAIRE")).toBeDefined();
  });

  it("exclut l'agent si autoriserFigeage=true mais jsTypeFlexibiliteMap absent", () => {
    const agent = makeAgent("a1", [makeConflictEvent()]);

    const { candidats, exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules, true, false, undefined, [], true, undefined
    );

    // Sans map, le figeage ne peut pas être résolu → exclu
    expect(candidats).toHaveLength(0);
    expect(exclusions.find((e) => e.regle === "CONFLIT_HORAIRE")).toBeDefined();
  });
});

// ─── 3. Remplissage solution et jsSourceFigee dans AffectationJs ─────────────

describe("allouerJsMultiple — solution et jsSourceFigee", () => {
  const js = makeJs("js-001");
  const agent = makeAgent("a1");
  const agentsMap = makeAgentMap(agent);

  it("solution AUCUN et jsSourceFigee null pour un candidat sans figeage", () => {
    const candidatesPerJs = new Map([["js-001", [makeCandidat("a1")]]]);
    const scenario = buildScenario([js], candidatesPerJs, agentsMap);

    const aff = scenario.affectations[0];
    expect(aff.solution.ajustement).toBe("AUCUN");
    expect(aff.solution.nature).toBe("DIRECTE");
    expect(aff.jsSourceFigee).toBeNull();
  });

  it("solution FIGEAGE_DIRECT et jsSourceFigee renseigné pour un candidat libéré par figeage", () => {
    const jsSourceFigee: JsSourceFigee = {
      planningLigneId: "ligne-giv002",
      codeJs: "GIV002",
      flexibilite: "DERNIER_RECOURS",
      agentId: "a1",
      justification: "Figeage test",
    };
    const candidatesPerJs = new Map([
      ["js-001", [makeCandidat("a1", "DIRECT", 90, jsSourceFigee)]],
    ]);
    const scenario = buildScenario([js], candidatesPerJs, agentsMap);

    const aff = scenario.affectations[0];
    expect(aff.solution.ajustement).toBe("FIGEAGE_DIRECT");
    expect(aff.solution.nature).toBe("DIRECTE");
    expect(aff.jsSourceFigee).toEqual(jsSourceFigee);
  });
});

// ─── 4. Pénalité différenciée JS non couverte ────────────────────────────────

describe("allouerJsMultiple — pénalité différenciée JS non couverte", () => {
  it("JS OBLIGATOIRE non couverte pénalise plus que JS DERNIER_RECOURS non couverte", () => {
    // Setup : 1 JS couverte + 1 JS non couverte dans chaque scénario (tauxCouverture=50% identique)
    // → la différence de score vient uniquement de la pénalité JS non couverte
    const jsCovered   = makeJs("js-covered",  { flexibilite: "OBLIGATOIRE" });
    const jsNcOblig   = makeJs("js-nc-oblig", { flexibilite: "OBLIGATOIRE" });
    const jsNcDR      = makeJs("js-nc-dr",    { flexibilite: "DERNIER_RECOURS" });
    const agent1      = makeAgent("a1");
    const agentsMap   = makeAgentMap(agent1);

    // Candidat pour js-covered uniquement
    const candidatesA = new Map<string, CandidatMultiJs[]>([
      ["js-covered",  [makeCandidat("a1")]],
      ["js-nc-oblig", []],
    ]);
    const candidatesB = new Map<string, CandidatMultiJs[]>([
      ["js-covered",  [makeCandidat("a1")]],
      ["js-nc-dr",    []],
    ]);

    const scenarioA = buildScenario([jsCovered, jsNcOblig], candidatesA, agentsMap);
    const scenarioB = buildScenario([jsCovered, jsNcDR],   candidatesB, agentsMap);

    // Les deux couvrent 1/2 JS ; seule la pénalité JS non couverte diffère
    expect(scenarioA.nbJsCouvertes).toBe(1);
    expect(scenarioB.nbJsCouvertes).toBe(1);
    // OBLIGATOIRE non couverte → score plus bas
    expect(scenarioA.score).toBeLessThan(scenarioB.score);
  });

  it("pénalité DERNIER_RECOURS non couverte = penaliteJsDernierRecours", () => {
    const jsDR = makeJs("js-dr", { flexibilite: "DERNIER_RECOURS" });
    const emptyPerJs = new Map<string, CandidatMultiJs[]>([["js-dr", []]]);
    const agentsMap = new Map<string, AgentDataMultiJs>();

    const scenario = buildScenario([jsDR], emptyPerJs, agentsMap);

    // Score de base = tauxCouverture × poidsCouverture = 0 × 1.0 = 0
    // Pénalité DR = penaliteJsDernierRecours = 5 (mais plancher à 0)
    expect(scenario.score).toBe(0);
    expect(scenario.nbJsNonCouvertes).toBe(1);
    expect(scenario.jsNonCouvertes[0].flexibilite).toBe("DERNIER_RECOURS");
  });

  it("figeage appliqué réduit le score du scénario de penaliteParFigeage", () => {
    const js = makeJs("js-001");
    const agent = makeAgent("a1");
    const agentsMap = makeAgentMap(agent);

    const jsSourceFigee: JsSourceFigee = {
      planningLigneId: "ligne-giv002",
      codeJs: "GIV002",
      flexibilite: "DERNIER_RECOURS",
      agentId: "a1",
      justification: "Test",
    };

    // Scénario sans figeage
    const candidatsSansFigeage = new Map([["js-001", [makeCandidat("a1", "DIRECT", 90, null)]]]);
    const scoreSansFigeage = buildScenario([js], candidatsSansFigeage, agentsMap).score;

    // Scénario avec figeage
    const candidatsAvecFigeage = new Map([["js-001", [makeCandidat("a1", "DIRECT", 90, jsSourceFigee)]]]);
    const scoreAvecFigeage = buildScenario([js], candidatsAvecFigeage, agentsMap).score;

    expect(scoreSansFigeage - scoreAvecFigeage).toBe(POIDS_SCORE_SCENARIO_MULTI.penaliteParFigeage);
  });
});

// ─── 5. Non-régression ────────────────────────────────────────────────────────

describe("Non-régression — comportement identique sans figeage", () => {
  it("trouverCandidatsPourJs sans figeage : agent en conflit reste exclu", () => {
    const js = makeJs("js-001");
    const agent = makeAgent("a1", [makeConflictEvent()]);

    const { candidats, exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules
    );

    expect(candidats).toHaveLength(0);
    expect(exclusions.find((e) => e.regle === "CONFLIT_HORAIRE")).toBeDefined();
  });

  it("allouerJsMultiple sans figeage : solution.ajustement toujours AUCUN", () => {
    const js = makeJs("js-001");
    const agent = makeAgent("a1");
    const candidatesPerJs = new Map([["js-001", [makeCandidat("a1")]]]);
    const agentsMap = makeAgentMap(agent);

    const scenario = buildScenario([js], candidatesPerJs, agentsMap);

    for (const aff of scenario.affectations) {
      expect(aff.solution.ajustement).toBe("AUCUN");
      expect(aff.jsSourceFigee).toBeNull();
    }
  });
});

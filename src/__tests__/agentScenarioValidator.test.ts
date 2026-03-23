/**
 * Tests unitaires — canAssignJsToAgentInScenario
 *
 * Couvre :
 *  - Chevauchement horaire avec JS déjà affectée → INCOMPATIBLE
 *  - JS non chevauchante → compatible (DIRECT)
 *  - Règle métier violée (repos insuffisant) → INCOMPATIBLE
 *  - Plusieurs JS déjà affectées → chevauchement détecté sur chacune
 *  - Agent sans planning ni affectation préalable → DIRECT
 */

import { canAssignJsToAgentInScenario } from "@/lib/simulation/multiJs/agentScenarioValidator";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";
import type { JsCible } from "@/types/js-simulation";
import type { PlanningEvent } from "@/engine/rules";

const rules = DEFAULT_WORK_RULES_MINUTES;

// ─── Builders ─────────────────────────────────────────────────────────────────

function makeJs(
  planningLigneId: string,
  date: string,
  heureDebut: string,
  heureFin: string,
  overrides: Partial<JsCible> = {}
): JsCible {
  return {
    planningLigneId,
    agentId:        "agent-source",
    agentNom:       "Source",
    agentPrenom:    "Agent",
    agentMatricule: "SRC",
    date,
    heureDebut,
    heureFin,
    amplitudeMin: 480,
    codeJs: "GIV001",
    typeJs: null,
    isNuit: false,
    importId: "import-1",
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentDataMultiJs["context"]> = {}): AgentDataMultiJs {
  return {
    context: {
      id:               "agent-1",
      nom:              "Dupont",
      prenom:           "Jean",
      matricule:        "M001",
      posteAffectation: "GARE-A",
      agentReserve:     false,
      peutFaireNuit:    true,
      peutEtreDeplace:  true,
      regimeB:          false,
      regimeC:          false,
      prefixesJs:       ["GIV"],
      lpaBaseId:        null,
      ...overrides,
    },
    events: [],
  };
}

function makeEvent(
  dateIso: string,
  heureDebut: string,
  heureFin: string,
): PlanningEvent {
  const [hD, mD] = heureDebut.split(":").map(Number);
  const [hF, mF] = heureFin.split(":").map(Number);
  const debut = new Date(dateIso);
  debut.setUTCHours(hD, mD, 0, 0);
  const fin = new Date(dateIso);
  fin.setUTCHours(hF, mF, 0, 0);
  if (fin <= debut) fin.setDate(fin.getDate() + 1);
  return {
    dateDebut: debut,
    dateFin: fin,
    heureDebut,
    heureFin,
    amplitudeMin: Math.round((fin.getTime() - debut.getTime()) / 60000),
    dureeEffectiveMin: null,
    jsNpo: "JS",
    codeJs: "GIV001",
    typeJs: null,
  };
}

// ─── 1. Agent sans contrainte → DIRECT ────────────────────────────────────────

describe("canAssignJsToAgentInScenario — agent libre", () => {
  it("agent sans planning ni affectation → compatible DIRECT", () => {
    const agent = makeAgent();
    const newJs = makeJs("js-1", "2024-03-20", "08:00", "16:00");

    const result = canAssignJsToAgentInScenario(agent, newJs, [], rules);

    expect(result.compatible).toBe(true);
    expect(result.statut).toBe("DIRECT");
  });
});

// ─── 2. Chevauchement horaire ─────────────────────────────────────────────────

describe("canAssignJsToAgentInScenario — chevauchement horaire", () => {
  it("nouvelle JS chevauche une JS déjà affectée → INCOMPATIBLE", () => {
    const agent = makeAgent();
    const jsDejaAffectee = makeJs("js-existante", "2024-03-20", "06:00", "14:00");
    const newJs          = makeJs("js-2",          "2024-03-20", "10:00", "18:00"); // chevauche

    const result = canAssignJsToAgentInScenario(agent, newJs, [jsDejaAffectee], rules);

    expect(result.compatible).toBe(false);
    expect(result.statut).toBe("INCOMPATIBLE");
    expect(result.motif).toMatch(/Chevauchement/i);
  });

  it("JS le même jour enchaînées (0 min de repos) → INCOMPATIBLE par repos insuffisant", () => {
    const agent = makeAgent();
    const jsDejaAffectee = makeJs("js-matin",     "2024-03-20", "06:00", "14:00");
    const newJs          = makeJs("js-apres-midi", "2024-03-20", "14:00", "22:00"); // enchaîné, 0 min repos

    const result = canAssignJsToAgentInScenario(agent, newJs, [jsDejaAffectee], rules);

    // Pas de chevauchement strict, mais repos journalier = 0 < minimum requis → NON_CONFORME
    expect(result.compatible).toBe(false);
    expect(result.statut).toBe("INCOMPATIBLE");
  });

  it("JS sur des jours différents → pas de chevauchement", () => {
    const agent = makeAgent();
    const jsJ0 = makeJs("js-j0", "2024-03-20", "08:00", "16:00");
    const jsJ1 = makeJs("js-j1", "2024-03-21", "08:00", "16:00");

    const result = canAssignJsToAgentInScenario(agent, jsJ1, [jsJ0], rules);

    expect(result.compatible).toBe(true);
  });

  it("chevauchement détecté parmi plusieurs JS déjà affectées", () => {
    const agent = makeAgent();
    const js1 = makeJs("js-1", "2024-03-20", "06:00", "14:00");
    const js2 = makeJs("js-2", "2024-03-21", "06:00", "14:00");
    // Nouvelle JS chevauche js2
    const newJs = makeJs("js-new", "2024-03-21", "10:00", "18:00");

    const result = canAssignJsToAgentInScenario(agent, newJs, [js1, js2], rules);

    expect(result.compatible).toBe(false);
    expect(result.statut).toBe("INCOMPATIBLE");
  });
});

// ─── 3. Repos journalier insuffisant → INCOMPATIBLE ──────────────────────────

describe("canAssignJsToAgentInScenario — repos journalier", () => {
  it("JS affectée finit à 14h, nouvelle JS à 20h le même jour (6h repos < 12h) → INCOMPATIBLE", () => {
    const agent = makeAgent();
    // Simuler : l'agent a une JS dans son planning se terminant à 14h
    agent.events = [makeEvent("2024-03-20", "06:00", "14:00")];

    // Nouvelle JS à 20h → seulement 6h de repos
    const newJs = makeJs("js-new", "2024-03-20", "20:00", "04:00");

    const result = canAssignJsToAgentInScenario(agent, newJs, [], rules);

    expect(result.compatible).toBe(false);
    expect(result.statut).toBe("INCOMPATIBLE");
  });

  it("repos suffisant (JS le lendemain avec 16h de repos) → compatible", () => {
    const agent = makeAgent();
    // Dernier poste : finit à 06:00 le 20
    agent.events = [makeEvent("2024-03-19", "22:00", "06:00")];

    // Nouvelle JS : 20h le 20 → 14h de repos
    const newJs = makeJs("js-new", "2024-03-20", "20:00", "04:00");

    const result = canAssignJsToAgentInScenario(agent, newJs, [], rules);

    expect(result.compatible).toBe(true);
  });
});

// ─── 4. Habilitation préfixe JS ───────────────────────────────────────────────

describe("canAssignJsToAgentInScenario — habilitation", () => {
  it("agent sans préfixe GIV affecté à GIV001 → INCOMPATIBLE (PREFIXE_JS bloquant)", () => {
    // Note : canAssignJsToAgentInScenario utilise evaluerMobilisabilite qui vérifie les préfixes
    const agent = makeAgent({ prefixesJs: ["VEN"] }); // pas GIV
    const newJs = makeJs("js-1", "2024-03-20", "08:00", "16:00", { codeJs: "GIV001" });

    const result = canAssignJsToAgentInScenario(agent, newJs, [], rules);

    expect(result.compatible).toBe(false);
    expect(result.statut).toBe("INCOMPATIBLE");
  });
});

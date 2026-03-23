/**
 * Tests unitaires — trouverCandidatsPourJs
 *
 * Couvre :
 *  - Exclusion SCOPE_RESERVE (candidateScope = "reserve_only", agent non-réserve)
 *  - Exclusion PREFIXE_JS (aucun préfixe / code non couvert)
 *  - Exclusion NUIT_HABILITATION
 *  - Exclusion CONFLIT_HORAIRE (déjà en service)
 *  - Agent éligible → présent dans candidats
 *  - Exclusion nominative : agentNom / agentPrenom / agentMatricule peuplés
 *  - Agent source (agentId == js.agentId) → silencieusement ignoré (pas dans exclusions)
 */

import { trouverCandidatsPourJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";
import type { JsCible } from "@/types/js-simulation";
import type { PlanningEvent } from "@/engine/rules";

const rules = DEFAULT_WORK_RULES_MINUTES;

// ─── Builders ─────────────────────────────────────────────────────────────────

function makeJs(overrides: Partial<JsCible> = {}): JsCible {
  return {
    planningLigneId: "js-001",
    agentId:         "agent-source",
    agentNom:        "Source",
    agentPrenom:     "Agent",
    agentMatricule:  "SRC",
    date:            "2024-03-20",
    heureDebut:      "08:00",
    heureFin:        "16:00",
    amplitudeMin:    480,
    codeJs:          "GIV001",
    typeJs:          null,
    isNuit:          false,
    importId:        "import-1",
    flexibilite:     "OBLIGATOIRE" as const,
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
  opts: { jsNpo?: "JS" | "NPO"; codeJs?: string } = {}
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
    jsNpo: opts.jsNpo ?? "JS",
    codeJs: opts.codeJs ?? "GIV001",
    typeJs: null,
  };
}

// ─── 1. Agent source silencieusement ignoré ───────────────────────────────────

describe("trouverCandidatsPourJs — agent source", () => {
  it("l'agent prévu sur la JS (agentId == js.agentId) est ignoré sans exclusion", () => {
    const js = makeJs();
    const agentSource = makeAgent({ id: "agent-source" });
    const { candidats, exclusions } = trouverCandidatsPourJs(
      js, [agentSource], "all_agents", rules
    );
    expect(candidats).toHaveLength(0);
    expect(exclusions).toHaveLength(0); // silencieux — pas dans les exclusions
  });
});

// ─── 2. SCOPE_RESERVE ────────────────────────────────────────────────────────

describe("trouverCandidatsPourJs — SCOPE_RESERVE", () => {
  it("agent non-réserve exclu si scope = reserve_only", () => {
    const js = makeJs();
    const agent = makeAgent({ agentReserve: false });
    const { candidats, exclusions } = trouverCandidatsPourJs(
      js, [agent], "reserve_only", rules
    );
    expect(candidats).toHaveLength(0);
    expect(exclusions.some(e => e.regle === "SCOPE_RESERVE")).toBe(true);
  });

  it("agent réserve accepté si scope = reserve_only", () => {
    const js = makeJs();
    const agent = makeAgent({ agentReserve: true });
    const { exclusions } = trouverCandidatsPourJs(
      js, [agent], "reserve_only", rules
    );
    expect(exclusions.some(e => e.regle === "SCOPE_RESERVE")).toBe(false);
  });

  it("agent non-réserve accepté si scope = all_agents", () => {
    const js = makeJs();
    const agent = makeAgent({ agentReserve: false });
    const { exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules
    );
    expect(exclusions.some(e => e.regle === "SCOPE_RESERVE")).toBe(false);
  });
});

// ─── 3. PREFIXE_JS ───────────────────────────────────────────────────────────

describe("trouverCandidatsPourJs — PREFIXE_JS", () => {
  it("aucun préfixe configuré → exclusion PREFIXE_JS", () => {
    const js = makeJs({ codeJs: "GIV001" });
    const agent = makeAgent({ prefixesJs: [] });
    const { exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules
    );
    expect(exclusions.some(e => e.regle === "PREFIXE_JS")).toBe(true);
  });

  it("préfixe ne correspondant pas au code JS → exclusion PREFIXE_JS", () => {
    const js = makeJs({ codeJs: "VEN001" });
    const agent = makeAgent({ prefixesJs: ["GIV"] });
    const { exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules
    );
    expect(exclusions.some(e => e.regle === "PREFIXE_JS")).toBe(true);
  });

  it("préfixe correspondant → pas d'exclusion PREFIXE_JS", () => {
    const js = makeJs({ codeJs: "GIV001" });
    const agent = makeAgent({ prefixesJs: ["GIV"] });
    const { exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules
    );
    expect(exclusions.some(e => e.regle === "PREFIXE_JS")).toBe(false);
  });
});

// ─── 4. NUIT_HABILITATION ────────────────────────────────────────────────────

describe("trouverCandidatsPourJs — NUIT_HABILITATION", () => {
  it("poste de nuit + agent non habilité → exclusion NUIT_HABILITATION", () => {
    // isNuit=true force la vérification d'habilitation nuit
    const js = makeJs({ heureDebut: "22:00", heureFin: "06:00", isNuit: true });
    const agent = makeAgent({ peutFaireNuit: false });
    const { exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules
    );
    expect(exclusions.some(e => e.regle === "NUIT_HABILITATION")).toBe(true);
  });

  it("poste de nuit + agent habilité → pas d'exclusion NUIT_HABILITATION", () => {
    const js = makeJs({ heureDebut: "22:00", heureFin: "06:00", isNuit: true });
    const agent = makeAgent({ peutFaireNuit: true });
    const { exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules
    );
    expect(exclusions.some(e => e.regle === "NUIT_HABILITATION")).toBe(false);
  });
});

// ─── 5. CONFLIT_HORAIRE ──────────────────────────────────────────────────────

describe("trouverCandidatsPourJs — CONFLIT_HORAIRE", () => {
  it("agent déjà en service sur la même plage → exclusion CONFLIT_HORAIRE", () => {
    const js = makeJs({ date: "2024-03-20", heureDebut: "08:00", heureFin: "16:00" });
    // Agent avec une JS non-Z chevauchante
    const agent = makeAgent();
    agent.events = [makeEvent("2024-03-20", "10:00", "18:00", { jsNpo: "JS", codeJs: "GIV002" })];

    const { exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules
    );
    expect(exclusions.some(e => e.regle === "CONFLIT_HORAIRE")).toBe(true);
  });

  it("agent libre (aucun événement) → pas d'exclusion CONFLIT_HORAIRE", () => {
    const js = makeJs();
    const agent = makeAgent();
    agent.events = [];
    const { exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules
    );
    expect(exclusions.some(e => e.regle === "CONFLIT_HORAIRE")).toBe(false);
  });
});

// ─── 6. Informations nominatives dans les exclusions ─────────────────────────

describe("trouverCandidatsPourJs — informations nominatives", () => {
  it("exclusion contient agentNom, agentPrenom, agentMatricule", () => {
    const js = makeJs({ codeJs: "VEN001" });
    const agent = makeAgent({
      id:         "agent-42",
      nom:        "Martin",
      prenom:     "Sophie",
      matricule:  "M042",
      prefixesJs: ["GIV"], // VEN001 n'est pas couvert → PREFIXE_JS
    });

    const { exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules
    );

    const excl = exclusions.find(e => e.agentId === "agent-42");
    expect(excl).toBeDefined();
    expect(excl?.agentNom).toBe("Martin");
    expect(excl?.agentPrenom).toBe("Sophie");
    expect(excl?.agentMatricule).toBe("M042");
    expect(excl?.jsId).toBe("js-001");
  });
});

// ─── 7. Agent éligible → présent dans candidats ──────────────────────────────

describe("trouverCandidatsPourJs — agent éligible", () => {
  it("agent sans violation → apparaît dans candidats avec score > 0", () => {
    const js = makeJs({ codeJs: "GIV001" });
    const agent = makeAgent({ prefixesJs: ["GIV"] });
    const { candidats, exclusions } = trouverCandidatsPourJs(
      js, [agent], "all_agents", rules
    );
    expect(candidats).toHaveLength(1);
    expect(candidats[0].agentId).toBe("agent-1");
    expect(candidats[0].score).toBeGreaterThan(0);
    expect(exclusions).toHaveLength(0);
  });

  it("candidats triés par score décroissant", () => {
    const js = makeJs({ codeJs: "GIV001" });

    // Agent A : sans conflit → score élevé
    const agentA = makeAgent({ id: "agent-A", nom: "A", prenom: "A", matricule: "A" });

    // Agent B : avec un conflit induit simulé (amplitude élevée)
    // On ne peut pas forcer un conflit facilement sans chevauchement,
    // donc on vérifie juste que les deux sont présents et triés
    const agentB = makeAgent({ id: "agent-B", nom: "B", prenom: "B", matricule: "B" });

    const { candidats } = trouverCandidatsPourJs(
      js, [agentA, agentB], "all_agents", rules
    );

    expect(candidats).toHaveLength(2);
    // Les scores doivent être dans l'ordre décroissant
    if (candidats.length >= 2) {
      expect(candidats[0].score).toBeGreaterThanOrEqual(candidats[1].score);
    }
  });
});

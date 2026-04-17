/**
 * Tests unitaires — Figeage des JS DERNIER_RECOURS (Phase 2)
 *
 * Couvre :
 *  - resolveFlexibiliteEvent : match exact typeJs, match préfixe codeJs, défaut OBLIGATOIRE
 *  - trouverCandidatsParFigeage : filtrage par raison, par flexibilité
 *  - construireScenarios : solution et jsSourceFigee propagés correctement
 */

import {
  resolveFlexibiliteEvent,
  trouverCandidatsParFigeage,
  RAISON_DEJA_EN_SERVICE,
} from "@/lib/simulation/candidateFinder";
import type { AgentWithPlanning } from "@/lib/simulation/candidateFinder";
import { construireScenarios } from "@/lib/simulation/scenarioBuilder";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { JsCible, ImpreuvuConfig, FlexibiliteJs, CandidatResult, JsSourceFigee } from "@/types/js-simulation";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";

// ─── Builders ─────────────────────────────────────────────────────────────────

function makeDate(dateStr: string, heureStr: string): Date {
  return new Date(`${dateStr}T${heureStr}:00`);
}

function makeEvent(opts: {
  dateDebut: Date;
  dateFin: Date;
  jsNpo?: "JS" | "NPO";
  codeJs?: string | null;
  typeJs?: string | null;
  planningLigneId?: string;
}): PlanningEvent {
  return {
    dateDebut: opts.dateDebut,
    dateFin: opts.dateFin,
    heureDebut: "08:00",
    heureFin: "16:00",
    amplitudeMin: Math.round((opts.dateFin.getTime() - opts.dateDebut.getTime()) / 60000),
    dureeEffectiveMin: null,
    jsNpo: opts.jsNpo ?? "JS",
    codeJs: opts.codeJs ?? null,
    typeJs: opts.typeJs ?? null,
    planningLigneId: opts.planningLigneId,
  };
}

function makeAgent(id: string): AgentContext {
  return {
    id,
    nom: "Dupont",
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
  };
}

function makeAgentWithPlanning(
  id: string,
  events: PlanningEvent[]
): AgentWithPlanning {
  return { context: makeAgent(id), events };
}

const DATE = "2025-06-10";

function makeJsCible(overrides: Partial<JsCible> = {}): JsCible {
  return {
    planningLigneId: "ligne-cible",
    agentId: "agent-initial",
    agentNom: "Martin",
    agentPrenom: "Paul",
    agentMatricule: "M000",
    date: DATE,
    heureDebut: "08:00",
    heureFin: "16:00",
    amplitudeMin: 480,
    codeJs: "GIV001",
    typeJs: "GIV",
    isNuit: false,
    importId: "import-1",
    flexibilite: "OBLIGATOIRE",
    ...overrides,
  };
}

function makeImprevu(overrides: Partial<ImpreuvuConfig> = {}): ImpreuvuConfig {
  return {
    partiel: false,
    heureDebutReel: "08:00",
    heureFinEstimee: "16:00",
    deplacement: false,
    remplacement: false,
    ...overrides,
  };
}

function makeJsSourceFigee(agentId: string): JsSourceFigee {
  return {
    planningLigneId: "ligne-source",
    codeJs: "GIV002",
    flexibilite: "DERNIER_RECOURS",
    agentId,
    justification: "JS GIV002 (DERNIER_RECOURS) figée — test",
  };
}

function makeCandidatResult(
  overrides: Partial<CandidatResult> = {}
): CandidatResult {
  return {
    agentId: "agent-1",
    nom: "Dupont",
    prenom: "Alice",
    matricule: "M001",
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
    ...overrides,
  };
}

// ─── resolveFlexibiliteEvent ──────────────────────────────────────────────────

describe("resolveFlexibiliteEvent", () => {
  const map = new Map<string, FlexibiliteJs>([
    ["GIV", "DERNIER_RECOURS"],
    ["CDG", "OBLIGATOIRE"],
  ]);

  it("retourne la flexibilité par match exact sur typeJs", () => {
    const event = makeEvent({
      dateDebut: makeDate(DATE, "08:00"),
      dateFin: makeDate(DATE, "16:00"),
      typeJs: "GIV",
    });
    expect(resolveFlexibiliteEvent(event, map)).toBe("DERNIER_RECOURS");
  });

  it("retourne OBLIGATOIRE par match exact typeJs CDG", () => {
    const event = makeEvent({
      dateDebut: makeDate(DATE, "08:00"),
      dateFin: makeDate(DATE, "16:00"),
      typeJs: "CDG",
    });
    expect(resolveFlexibiliteEvent(event, map)).toBe("OBLIGATOIRE");
  });

  it("utilise le préfixe codeJs si typeJs absent", () => {
    const event = makeEvent({
      dateDebut: makeDate(DATE, "08:00"),
      dateFin: makeDate(DATE, "16:00"),
      codeJs: "GIV 007",
      typeJs: null,
    });
    expect(resolveFlexibiliteEvent(event, map)).toBe("DERNIER_RECOURS");
  });

  it("retourne OBLIGATOIRE par défaut si aucun match", () => {
    const event = makeEvent({
      dateDebut: makeDate(DATE, "08:00"),
      dateFin: makeDate(DATE, "16:00"),
      codeJs: "XYZ999",
      typeJs: null,
    });
    expect(resolveFlexibiliteEvent(event, map)).toBe("OBLIGATOIRE");
  });

  it("retourne OBLIGATOIRE si typeJs absent et codeJs null", () => {
    const event = makeEvent({
      dateDebut: makeDate(DATE, "08:00"),
      dateFin: makeDate(DATE, "16:00"),
      codeJs: null,
      typeJs: null,
    });
    expect(resolveFlexibiliteEvent(event, map)).toBe("OBLIGATOIRE");
  });

  it("typeJs prend priorité sur codeJs", () => {
    // typeJs = CDG (OBLIGATOIRE) mais codeJs commence par GIV (DERNIER_RECOURS)
    const map2 = new Map<string, FlexibiliteJs>([
      ["GIV", "DERNIER_RECOURS"],
      ["CDG", "OBLIGATOIRE"],
    ]);
    const event = makeEvent({
      dateDebut: makeDate(DATE, "08:00"),
      dateFin: makeDate(DATE, "16:00"),
      codeJs: "GIV001",
      typeJs: "CDG",
    });
    expect(resolveFlexibiliteEvent(event, map2)).toBe("OBLIGATOIRE");
  });
});

// ─── trouverCandidatsParFigeage ───────────────────────────────────────────────

describe("trouverCandidatsParFigeage", () => {
  const jsCible = makeJsCible();
  const imprevu = makeImprevu();

  const debutImprevu = makeDate(DATE, "08:00");
  const finImprevu   = makeDate(DATE, "16:00");

  const mapDernierRecours = new Map<string, FlexibiliteJs>([
    ["GIV002", "DERNIER_RECOURS"],
  ]);
  const mapObligatoire = new Map<string, FlexibiliteJs>([
    ["GIV002", "OBLIGATOIRE"],
  ]);

  function makeConflitEvent(planningLigneId?: string): PlanningEvent {
    return makeEvent({
      dateDebut: debutImprevu,
      dateFin: finImprevu,
      jsNpo: "JS",
      codeJs: "GIV002",
      typeJs: null,
      planningLigneId,
    });
  }

  it("ignore les agents exclus pour une raison autre que DEJA_EN_SERVICE", () => {
    const agent = makeAgentWithPlanning("a1", [makeConflitEvent()]);
    const exclus = [{ agent, raison: "Non habilité poste de nuit" }];
    const result = trouverCandidatsParFigeage(exclus, jsCible, imprevu, mapDernierRecours);
    expect(result).toHaveLength(0);
  });

  it("ignore un agent en service avec une JS OBLIGATOIRE", () => {
    const agent = makeAgentWithPlanning("a2", [makeConflitEvent()]);
    const exclus = [{ agent, raison: RAISON_DEJA_EN_SERVICE }];
    const result = trouverCandidatsParFigeage(exclus, jsCible, imprevu, mapObligatoire);
    expect(result).toHaveLength(0);
  });

  it("retourne un candidat figeage pour une JS DERNIER_RECOURS", () => {
    const conflitEvent = makeConflitEvent("ligne-giv002");
    const agent = makeAgentWithPlanning("a3", [conflitEvent]);
    const exclus = [{ agent, raison: RAISON_DEJA_EN_SERVICE }];
    const result = trouverCandidatsParFigeage(exclus, jsCible, imprevu, mapDernierRecours);

    expect(result).toHaveLength(1);
    const { jsSourceFigee, eventsAvecFigeage } = result[0];
    expect(jsSourceFigee.agentId).toBe("a3");
    expect(jsSourceFigee.codeJs).toBe("GIV002");
    expect(jsSourceFigee.flexibilite).toBe("DERNIER_RECOURS");
    expect(jsSourceFigee.planningLigneId).toBe("ligne-giv002");
    // La JS conflictuelle doit être retirée du planning simulé
    expect(eventsAvecFigeage).not.toContain(conflitEvent);
  });

  it("retourne le bon agent même si plusieurs exclus présents", () => {
    const conflitEvent = makeConflitEvent();
    const agentFigeable = makeAgentWithPlanning("a4", [conflitEvent]);
    const agentAutre    = makeAgentWithPlanning("a5", [makeConflitEvent()]);
    const exclus = [
      { agent: agentAutre,    raison: "Non habilité poste de nuit" },
      { agent: agentFigeable, raison: RAISON_DEJA_EN_SERVICE },
    ];
    const result = trouverCandidatsParFigeage(exclus, jsCible, imprevu, mapDernierRecours);
    expect(result).toHaveLength(1);
    expect(result[0].agent.context.id).toBe("a4");
  });

  it("planningLigneId vide ('') si absente sur l'événement", () => {
    const agent = makeAgentWithPlanning("a6", [makeConflitEvent(undefined)]);
    const exclus = [{ agent, raison: RAISON_DEJA_EN_SERVICE }];
    const result = trouverCandidatsParFigeage(exclus, jsCible, imprevu, mapDernierRecours);
    expect(result[0].jsSourceFigee.planningLigneId).toBe("");
  });
});

// ─── construireScenarios — solution et jsSourceFigee ─────────────────────────

describe("construireScenarios — propagation solution / jsSourceFigee", () => {
  const jsCible = makeJsCible();
  const imprevu = makeImprevu();
  const tousAgents: { context: AgentContext; events: PlanningEvent[] }[] = [];

  it("solution AUCUN et jsSourceFigee null pour un candidat direct sans figeage", () => {
    const candidat = makeCandidatResult({ jsSourceFigee: null });
    const scenarios = construireScenarios([candidat], jsCible, imprevu, tousAgents, undefined, DEFAULT_WORK_RULES_MINUTES);

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].solution.ajustement).toBe("AUCUN");
    expect(scenarios[0].solution.nature).toBe("DIRECTE");
    expect(scenarios[0].jsSourceFigee).toBeNull();
  });

  it("solution FIGEAGE_DIRECT et jsSourceFigee renseigné pour un candidat libéré par figeage", () => {
    const jsSourceFigee = makeJsSourceFigee("agent-1");
    const candidat = makeCandidatResult({ jsSourceFigee });
    const scenarios = construireScenarios([candidat], jsCible, imprevu, tousAgents, undefined, DEFAULT_WORK_RULES_MINUTES);

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].solution.ajustement).toBe("FIGEAGE_DIRECT");
    expect(scenarios[0].solution.nature).toBe("DIRECTE");
    expect(scenarios[0].jsSourceFigee).toEqual(jsSourceFigee);
  });
});

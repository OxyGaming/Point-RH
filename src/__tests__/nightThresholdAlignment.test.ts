/**
 * Tests d'alignement des seuils nuit (C3).
 *
 * Vérifient que le pré-filtre des candidats et l'évaluation fine partagent
 * exactement les mêmes seuils (rules.periodeNocturne), via le helper
 * isJsDeNuitFromRules.
 *
 * Cas pivots :
 *   - JS borderline avec seuilJsNuit custom (60min vs 150min par défaut) :
 *     une JS 21h–23h (90min nocturnes) n'est PAS nuit avec les defaults
 *     (90 < 150) mais l'EST avec le seuil custom (90 > 60). Un agent non
 *     habilité doit donc être éligible côté defaults et exclus côté custom.
 *   - Le pré-filtre ignore le booléen jsCible.isNuit pré-calculé côté UI
 *     (calculé sans connaissance des rules) — c'est le helper qui décide.
 */

import { isJsDeNuitFromRules } from "@/lib/rules/nightThreshold";
import {
  DEFAULT_WORK_RULES_MINUTES,
  type WorkRulesMinutes,
} from "@/lib/rules/workRules";
import { preFilterCandidats } from "@/lib/simulation/candidateFinder";
import type { AgentWithPlanning } from "@/lib/simulation/candidateFinder";
import { trouverCandidatsPourJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { JsCible, ImpreuvuConfig } from "@/types/js-simulation";
import type { AgentContext } from "@/engine/rules";

// ─── Helpers de fixture ───────────────────────────────────────────────────────

const DEFAULT_RULES_MIN: WorkRulesMinutes = DEFAULT_WORK_RULES_MINUTES;

function makeContext(peutFaireNuit: boolean, overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    id: "agt-1",
    nom: "Test",
    prenom: "Agent",
    matricule: "T1",
    posteAffectation: "GARE-A",
    agentReserve: false,
    peutFaireNuit,
    peutEtreDeplace: true,
    regimeB: false,
    regimeC: false,
    prefixesJs: ["GIV"],
    lpaBaseId: null,
    ...overrides,
  };
}

function makeAgent(peutFaireNuit: boolean): AgentWithPlanning {
  return { context: makeContext(peutFaireNuit), events: [] };
}

function makeAgentMulti(peutFaireNuit: boolean): AgentDataMultiJs {
  return { context: makeContext(peutFaireNuit), events: [] };
}

function makeJs(overrides: Partial<JsCible> = {}): JsCible {
  return {
    planningLigneId: "js-1",
    agentId:        "agt-source",
    agentNom:       "Src",
    agentPrenom:    "A",
    agentMatricule: "S",
    date:           "2024-03-20",
    heureDebut:     "21:00",
    heureFin:       "23:00",
    amplitudeMin:   120,
    codeJs:         "GIV001",
    typeJs:         null,
    isNuit:         false,
    importId:       "imp-1",
    flexibilite:    "OBLIGATOIRE",
    ...overrides,
  };
}

const imprevu: ImpreuvuConfig = {
  partiel:         false,
  heureDebutReel:  "21:00",
  heureFinEstimee: "23:00",
  deplacement:     false,
  remplacement:    true,
};

// ─── Helper isJsDeNuitFromRules ───────────────────────────────────────────────

describe("isJsDeNuitFromRules — wrapper rules-aware", () => {
  it("baseline : seuils par défaut (21h30–06h30, 2h30) → comportement identique à isJsDeNuit", () => {
    // JS 22:00 → 01:30 : chevauchement 120min (22:00→24:00) + 90min (00:00→01:30) = 210min > 150 → NUIT
    expect(isJsDeNuitFromRules("22:00", "01:30", DEFAULT_RULES_MIN)).toBe(true);
    // JS 21:00 → 23:00 : 90min (21:30→23:00) < 150 → NON nuit
    expect(isJsDeNuitFromRules("21:00", "23:00", DEFAULT_RULES_MIN)).toBe(false);
  });

  it("override debutSoir (22h00) modifie la classification", () => {
    const custom: WorkRulesMinutes = {
      ...DEFAULT_RULES_MIN,
      periodeNocturne: { ...DEFAULT_RULES_MIN.periodeNocturne, debutSoir: 22 * 60 },
    };
    // JS 22:00 → 00:30 (post-minuit) : defaults (debutSoir=21h30) = 150min ; custom (22h) = 150min
    // Pas pivot. On teste plutôt JS 21:45 → 00:30 :
    //   defaults : (21:45→24:00) + (00:00→00:30) = 135 + 30 = 165min > 150 → NUIT
    //   custom  : (22:00→24:00) + (00:00→00:30) = 120 + 30 = 150min, PAS strict > 150 → NON nuit
    expect(isJsDeNuitFromRules("21:45", "00:30", DEFAULT_RULES_MIN)).toBe(true);
    expect(isJsDeNuitFromRules("21:45", "00:30", custom)).toBe(false);
  });

  it("override finMatin (07h00) modifie la classification", () => {
    const custom: WorkRulesMinutes = {
      ...DEFAULT_RULES_MIN,
      periodeNocturne: { ...DEFAULT_RULES_MIN.periodeNocturne, finMatin: 7 * 60 },
    };
    // JS 04:00 → 09:00 : defaults (06h30) = 150min PAS > 150 → NON ; custom (07h) = 180min → NUIT
    expect(isJsDeNuitFromRules("04:00", "09:00", DEFAULT_RULES_MIN)).toBe(false);
    expect(isJsDeNuitFromRules("04:00", "09:00", custom)).toBe(true);
  });

  it("override seuilJsNuit (1h) modifie la classification", () => {
    const custom: WorkRulesMinutes = {
      ...DEFAULT_RULES_MIN,
      periodeNocturne: { ...DEFAULT_RULES_MIN.periodeNocturne, seuilJsNuit: 60 },
    };
    // JS 21:00 → 23:00 : 90min nocturnes. Defaults seuil=150 → NON ; custom seuil=60 → NUIT
    expect(isJsDeNuitFromRules("21:00", "23:00", DEFAULT_RULES_MIN)).toBe(false);
    expect(isJsDeNuitFromRules("21:00", "23:00", custom)).toBe(true);
  });
});

// ─── Pré-filtre single-JS ─────────────────────────────────────────────────────

describe("preFilterCandidats — alignement nuit sur rules.periodeNocturne", () => {
  it("baseline : agent non-habilité, JS borderline, defaults → reste éligible", () => {
    const { eligible, exclus } = preFilterCandidats(
      [makeAgent(false)],
      makeJs(),
      imprevu,
      "agt-source",
      DEFAULT_RULES_MIN,
    );
    expect(eligible).toHaveLength(1);
    expect(exclus).toHaveLength(0);
  });

  it("seuilJsNuit=60min : même JS borderline → agent non-habilité exclu (alignement avec evaluation fine)", () => {
    const custom: WorkRulesMinutes = {
      ...DEFAULT_RULES_MIN,
      periodeNocturne: { ...DEFAULT_RULES_MIN.periodeNocturne, seuilJsNuit: 60 },
    };
    const { eligible, exclus } = preFilterCandidats(
      [makeAgent(false)],
      makeJs(),
      imprevu,
      "agt-source",
      custom,
    );
    expect(eligible).toHaveLength(0);
    expect(exclus).toHaveLength(1);
    expect(exclus[0].raison).toBe("Non habilité poste de nuit");
  });

  it("ignore le pré-calculé jsCible.isNuit (UI) en faveur du calcul rules-aware", () => {
    // JS avec isNuit=true (pré-calculé UI) mais avec defaults, le calcul rules dit NON nuit.
    // Le pré-filtre doit suivre rules, pas le booléen pré-calculé.
    const jsAvecPreCalc = makeJs({ isNuit: true });
    const { eligible } = preFilterCandidats(
      [makeAgent(false)],
      jsAvecPreCalc,
      imprevu,
      "agt-source",
      DEFAULT_RULES_MIN,
    );
    expect(eligible).toHaveLength(1); // pas exclu malgré jsCible.isNuit=true
  });

  it("agent habilité nuit reste éligible quels que soient les seuils", () => {
    const custom: WorkRulesMinutes = {
      ...DEFAULT_RULES_MIN,
      periodeNocturne: { ...DEFAULT_RULES_MIN.periodeNocturne, seuilJsNuit: 60 },
    };
    const { eligible } = preFilterCandidats(
      [makeAgent(true)],
      makeJs(),
      imprevu,
      "agt-source",
      custom,
    );
    expect(eligible).toHaveLength(1);
  });
});

// ─── Pré-filtre multi-JS ──────────────────────────────────────────────────────

describe("trouverCandidatsPourJs — cohérence single-JS / multi-JS sur les seuils nuit", () => {
  it("seuilJsNuit=60min : multi-JS exclut l'agent non-habilité comme single-JS le ferait", () => {
    const custom: WorkRulesMinutes = {
      ...DEFAULT_RULES_MIN,
      periodeNocturne: { ...DEFAULT_RULES_MIN.periodeNocturne, seuilJsNuit: 60 },
    };
    const { candidats, exclusions } = trouverCandidatsPourJs(
      makeJs(),
      [makeAgentMulti(false)],
      "all_agents",
      custom,
      true,
      false,
    );
    expect(candidats).toHaveLength(0);
    expect(exclusions.some((e) => e.regle === "NUIT_HABILITATION")).toBe(true);
  });

  it("rules par défaut : agent non-habilité reste candidat sur JS borderline (alignement single-JS)", () => {
    const { candidats, exclusions } = trouverCandidatsPourJs(
      makeJs(),
      [makeAgentMulti(false)],
      "all_agents",
      DEFAULT_RULES_MIN,
      true,
      false,
    );
    // Aucune exclusion pour habilitation nuit
    expect(exclusions.some((e) => e.regle === "NUIT_HABILITATION")).toBe(false);
    // Note : l'agent peut être exclu pour d'autres raisons (planning vide → pas de conflit, donc candidat)
    expect(candidats).toHaveLength(1);
  });
});

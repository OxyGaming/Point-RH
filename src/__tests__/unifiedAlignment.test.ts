/**
 * Tests d'alignement C1/C2 — solveur unifié vs moteur historique.
 *
 * Décision métier 2026-05-08 : MIN_REGIME_BC et GPT_NUIT_CONSECUTIVES restent
 * en VIGILANCE côté unifié, alignés sur le comportement de evaluerMobilisabilite.
 *
 * Ces tests sont des GARDE-FOUS ANTI-RÉGRESSION :
 *  - 1. Statique : REGLES_FATALES ⊆ REGLES_BLOQUANTES (engine). Si quelqu'un
 *       réintroduit une règle bloquante côté unifié sans l'aligner côté engine,
 *       le test échoue immédiatement.
 *  - 2. Statique : REGLES_VIGILANCE_PURE ∩ REGLES_BLOQUANTES = ∅ (les règles
 *       VIGILANCE pures ne doivent jamais être bloquantes côté engine — sinon
 *       on accepte côté unifié ce que l'engine refuse).
 *  - 3. Comportemental : `mapViolationsToConsequences` traite les règles
 *       VIGILANCE pures sans les rejeter (vigilancePure=true, irrécupérable=false).
 *  - 4. Comportemental : pour MIN_REGIME_BC bout-en-bout, engine et unifié
 *       produisent le même verdict (VIGILANCE, agent mobilisable).
 *
 * Voir docs/unified-solver-divergences.md pour le contexte fonctionnel.
 */

import {
  evaluerMobilisabilite,
  type AgentContext,
  type PlanningEvent,
} from "@/engine/rules";
import { REGLES_BLOQUANTES } from "@/engine/ruleTypes";
import {
  REGLES_FATALES,
  REGLES_VIGILANCE_PURE,
  evaluerImpactComplet,
  mapViolationsToConsequences,
} from "@/lib/simulation/unified/evaluation";
import {
  besoinRacineFromJs,
  creerEtatInitial,
} from "@/lib/simulation/unified";
import { buildCoverageIndex } from "@/lib/simulation/multiJs/chaineCache";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";
import type { JsCible } from "@/types/js-simulation";
import type { SimulationInput, RegleViolation, DetailCalcul } from "@/types/simulation";

// ─── Fixtures minimales ──────────────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    id: "a1",
    nom: "Dupont",
    prenom: "Alice",
    matricule: "M001",
    posteAffectation: "GARE-A",
    agentReserve: false,
    peutFaireNuit: true,
    peutEtreDeplace: false,
    regimeB: false,
    regimeC: false,
    prefixesJs: ["GIC"],
    lpaBaseId: null,
    ...overrides,
  };
}

function emptyDetail(): DetailCalcul {
  return {
    amplitudeMaxAutorisee: 0,
    amplitudeImprevu: 0,
    amplitudeRaison: "",
    dureeEffectiveMax: 0,
    reposJournalierMin: 0,
    dernierPosteDebut: null,
    dernierPosteFin: null,
    dernierPosteDate: null,
    reposJournalierDisponible: null,
    gptActuel: 0,
    gptMax: 0,
    teGptCumulAvant: 0,
    teGptLignes: [],
    reposPeriodiqueProchain: null,
    violations: [],
    respectees: [],
    pointsVigilance: [],
    disponible: false,
    deplacementInfo: null,
    gptRpAnalyse: null,
  };
}

// ─── 1. Garde-fou statique : REGLES_FATALES ⊆ REGLES_BLOQUANTES ──────────────

describe("Alignement C1/C2 — invariants statiques", () => {
  it("REGLES_FATALES (unifié) ⊆ REGLES_BLOQUANTES (engine)", () => {
    // Toute règle qui rend l'agent fatal côté unifié doit aussi être bloquante
    // côté engine. Sinon : un agent mobilisable côté legacy serait silencieusement
    // rejeté côté unifié — exactement la divergence C1 corrigée par cet alignement.
    const bloquantes = new Set<string>(REGLES_BLOQUANTES);
    const horsLegacy: string[] = [];
    for (const fatale of REGLES_FATALES) {
      if (!bloquantes.has(fatale)) horsLegacy.push(fatale);
    }
    expect(horsLegacy).toEqual([]);
  });

  it("REGLES_VIGILANCE_PURE ne contient AUCUNE règle bloquante de l'engine", () => {
    // Réciproque : toute règle traitée comme VIGILANCE pure côté unifié doit
    // produire VIGILANCE côté engine (= ne PAS être dans REGLES_BLOQUANTES).
    // Sinon : on rendrait l'agent mobilisable alors que l'engine le refuse.
    const bloquantes = new Set<string>(REGLES_BLOQUANTES);
    const conflits: string[] = [];
    for (const vp of REGLES_VIGILANCE_PURE) {
      if (bloquantes.has(vp)) conflits.push(vp);
    }
    expect(conflits).toEqual([]);
  });

  it("MIN_REGIME_BC et GPT_NUIT_CONSECUTIVES sont dans VIGILANCE_PURE", () => {
    // Document explicitement la décision métier 2026-05-08 dans le code.
    // Si quelqu'un retire ces règles, ce test signale la régression et oblige
    // à mettre à jour docs/unified-solver-divergences.md avant de merger.
    expect(REGLES_VIGILANCE_PURE.has("MIN_REGIME_BC")).toBe(true);
    expect(REGLES_VIGILANCE_PURE.has("GPT_NUIT_CONSECUTIVES")).toBe(true);
  });

  it("MIN_REGIME_BC n'est PAS dans REGLES_FATALES (régression C1)", () => {
    expect(REGLES_FATALES.has("MIN_REGIME_BC")).toBe(false);
  });
});

// ─── 2. Test direct du mapper sur règles VIGILANCE pures ─────────────────────

describe("mapViolationsToConsequences — règles VIGILANCE pures", () => {
  const agent = makeAgent();
  const events: PlanningEvent[] = [];
  const detail = emptyDetail();

  it("MIN_REGIME_BC seule → vigilancePure=true, irrécupérable=false, pas de consequence", () => {
    const v: RegleViolation = {
      regle: "MIN_REGIME_BC",
      description: "Durée inférieure au minimum pour régime B/C",
      valeur: "04:00",
      limite: "05:30",
    };
    const result = mapViolationsToConsequences([v], detail, agent, events, "imp-test");
    expect(result.irrecuperable).toBe(false);
    expect(result.vigilancePure).toBe(true);
    expect(result.consequences).toEqual([]);
    expect(result.raisonRejet).toBeUndefined();
  });

  it("GPT_NUIT_CONSECUTIVES seule → vigilancePure=true, irrécupérable=false", () => {
    const v: RegleViolation = {
      regle: "GPT_NUIT_CONSECUTIVES",
      description: "Agent aurait 2 GPT de nuit consécutives",
    };
    const result = mapViolationsToConsequences([v], detail, agent, events, "imp-test");
    expect(result.irrecuperable).toBe(false);
    expect(result.vigilancePure).toBe(true);
    expect(result.consequences).toEqual([]);
  });

  it("violation fatale (PREFIXE_JS) seule → irrécupérable=true, vigilancePure=false", () => {
    const v: RegleViolation = {
      regle: "PREFIXE_JS",
      description: "Code JS non couvert",
    };
    const result = mapViolationsToConsequences([v], detail, agent, events, "imp-test");
    expect(result.irrecuperable).toBe(true);
    expect(result.vigilancePure).toBe(false);
    expect(result.raisonRejet).toContain("PREFIXE_JS");
  });

  it("MIN_REGIME_BC + AMPLITUDE → fatal court-circuite (priorité aux règles fatales)", () => {
    // Si plusieurs violations dont une fatale : l'agent est rejeté quoi qu'il
    // arrive. Le vigilancePure n'est exposé que si aucune violation n'est fatale.
    const result = mapViolationsToConsequences(
      [
        { regle: "MIN_REGIME_BC", description: "..." },
        { regle: "AMPLITUDE", description: "..." },
      ],
      detail,
      agent,
      events,
      "imp-test"
    );
    expect(result.irrecuperable).toBe(true);
    expect(result.vigilancePure).toBe(false);
  });
});

// ─── 3. Alignement bout-en-bout : MIN_REGIME_BC ──────────────────────────────

describe("Alignement C1 bout-en-bout — MIN_REGIME_BC", () => {
  // Agent régime B avec une JS d'amplitude 4h00 — défaut minRegimeBC = 5h30
  // (cf. lib/rules/workRules.ts:41) → violation MIN_REGIME_BC seule.

  const agent = makeAgent({ regimeB: true });
  const events: PlanningEvent[] = []; // pas de planning antérieur, juste l'imprévu
  const date = "2026-06-10";
  const heureDebut = "08:00";
  const heureFin = "12:00"; // 4h00 < 5h30 → déclenche MIN_REGIME_BC

  const simulationInput: SimulationInput = {
    importId: "imp-test",
    dateDebut: date,
    dateFin: date,
    heureDebut,
    heureFin,
    poste: "GIC001",
    codeJs: "GIC001",
    remplacement: false,
    deplacement: false,
    posteNuit: false,
  };

  it("evaluerMobilisabilite (engine) → statut VIGILANCE", () => {
    const r = evaluerMobilisabilite(agent, events, simulationInput);
    expect(r.statut).toBe("VIGILANCE");
    expect(r.detail.violations).toHaveLength(1);
    expect(r.detail.violations[0].regle).toBe("MIN_REGIME_BC");
  });

  it("evaluerImpactComplet (unifié) → faisable=true, statut VIGILANCE", () => {
    const agentData = { context: agent, events };
    const agentsMap = new Map([[agent.id, agentData]]);
    const etat = creerEtatInitial({
      agentsMap,
      index: buildCoverageIndex([agentData]),
      rules: DEFAULT_WORK_RULES_MINUTES,
      importId: "imp-test",
    });

    const js: JsCible = {
      planningLigneId: "pli-cible",
      agentId: "agt-source",
      agentNom: "SOURCE",
      agentPrenom: "AGT",
      agentMatricule: "M0",
      date,
      heureDebut,
      heureFin,
      heureDebutJsType: heureDebut,
      heureFinJsType: heureFin,
      amplitudeMin: 240,
      codeJs: "GIC001",
      typeJs: "GIC",
      isNuit: false,
      importId: "imp-test",
      flexibilite: "OBLIGATOIRE",
    };
    const besoin = besoinRacineFromJs(js);

    const result = evaluerImpactComplet(agent, besoin, etat);

    expect(result.faisable).toBe(true);
    expect(result.statut).toBe("VIGILANCE");
    // Pas de cascade émise — la VIGILANCE est "pure", pas un conflit à résoudre
    expect(result.consequences).toEqual([]);
  });

  it("engine et unifié produisent le même verdict (VIGILANCE, mobilisable)", () => {
    // Test de cohérence cross-engine — c'est l'invariant C1.
    const engineResult = evaluerMobilisabilite(agent, events, simulationInput);

    const agentData = { context: agent, events };
    const agentsMap = new Map([[agent.id, agentData]]);
    const etat = creerEtatInitial({
      agentsMap,
      index: buildCoverageIndex([agentData]),
      rules: DEFAULT_WORK_RULES_MINUTES,
      importId: "imp-test",
    });
    const js: JsCible = {
      planningLigneId: "pli-cible",
      agentId: "agt-source",
      agentNom: "SOURCE",
      agentPrenom: "AGT",
      agentMatricule: "M0",
      date, heureDebut, heureFin,
      heureDebutJsType: heureDebut, heureFinJsType: heureFin,
      amplitudeMin: 240,
      codeJs: "GIC001",
      typeJs: "GIC",
      isNuit: false,
      importId: "imp-test",
      flexibilite: "OBLIGATOIRE",
    };
    const unifiedResult = evaluerImpactComplet(agent, besoinRacineFromJs(js), etat);

    // Engine = VIGILANCE → unified = VIGILANCE+faisable (équivalent fonctionnel)
    expect(engineResult.statut).toBe("VIGILANCE");
    expect(unifiedResult.faisable).toBe(true);
    expect(unifiedResult.statut).toBe("VIGILANCE");
  });
});

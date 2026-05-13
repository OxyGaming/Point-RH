/**
 * Tests d'alignement du pré-filtre déplacement (C4).
 *
 * Vérifient que single-JS et multi-JS appliquent la MÊME règle LPA-aware :
 *   - LPA déterminable → laisser passer (l'amplitude jugera)
 *   - LPA indéterminable + agent non habilité manuel → exclure
 *   - LPA indéterminable + agent habilité manuel → laisser passer
 *
 * Avant C4, multi-JS bloquait dès `deplacement && !peutEtreDeplace`, sans
 * consulter effectiveServiceMap — divergence latente non visible tant que
 * le caller passe `deplacement=false` par défaut, mais cassante dès qu'un
 * caller passe `deplacement=true`.
 */

import {
  isDeplacementManuelBloquant,
} from "@/lib/simulation/deplacementPrefilter";
import {
  preFilterCandidats,
  type AgentWithPlanning,
} from "@/lib/simulation/candidateFinder";
import { trouverCandidatsPourJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";
import type { AgentContext } from "@/engine/rules";
import type { JsCible, ImpreuvuConfig } from "@/types/js-simulation";
import type { EffectiveServiceInfo } from "@/types/deplacement";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeContext(peutEtreDeplace: boolean, overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    id: "agt-1",
    nom: "Test",
    prenom: "Agent",
    matricule: "T1",
    posteAffectation: "GARE-A",
    agentReserve: false,
    peutFaireNuit: true,
    peutEtreDeplace,
    regimeB: false,
    regimeC: false,
    prefixesJs: ["GIV"],
    lpaBaseId: null,
    ...overrides,
  };
}

function makeAgent(peutEtreDeplace: boolean): AgentWithPlanning {
  return { context: makeContext(peutEtreDeplace), events: [] };
}

function makeAgentMulti(peutEtreDeplace: boolean): AgentDataMultiJs {
  return { context: makeContext(peutEtreDeplace), events: [] };
}

function makeJs(overrides: Partial<JsCible> = {}): JsCible {
  return {
    planningLigneId: "js-1",
    agentId:        "agt-source",
    agentNom:       "Src",
    agentPrenom:    "A",
    agentMatricule: "S",
    date:           "2024-03-20",
    heureDebut:     "08:00",
    heureFin:       "16:00",
    amplitudeMin:   480,
    codeJs:         "GIV001",
    typeJs:         null,
    isNuit:         false,
    importId:       "imp-1",
    flexibilite:    "OBLIGATOIRE",
    ...overrides,
  };
}

const imprevuDeplacement: ImpreuvuConfig = {
  partiel:         false,
  heureDebutReel:  "08:00",
  heureFinEstimee: "16:00",
  deplacement:     true, // ← scénario où le déplacement est demandé
  remplacement:    true,
};

const imprevuSansDeplacement: ImpreuvuConfig = {
  ...imprevuDeplacement,
  deplacement: false,
};

/** Service effectif LPA-aware avec amplitude déterminable */
function effSvcLpaDeterminable(estEnDeplacement: boolean): EffectiveServiceInfo {
  return {
    jsTypeId: "jstype-1",
    jsTypeCode: "GIV001",
    jsTypeLibelle: "Service standard",
    lpaId: "lpa-1",
    jsDansLpa: !estEnDeplacement,
    estEnDeplacement,
    tempsTrajetAllerMin: estEnDeplacement ? 30 : 0,
    tempsTrajetRetourMin: estEnDeplacement ? 30 : 0,
    heureDebutReference: "08:00",
    heureFinReference: "16:00",
    heureDebutEffective: estEnDeplacement ? "07:30" : "08:00",
    heureFinEffective: estEnDeplacement ? "16:30" : "16:00",
    amplitudeEffectiveMin: estEnDeplacement ? 540 : 480,
    regimeRH: estEnDeplacement ? "deplacement" : "general",
    indeterminable: false,
    explication: "Test fixture",
  };
}

/** Service effectif LPA indéterminable (fallback manuel) */
function effSvcLpaIndeterminable(): EffectiveServiceInfo {
  return {
    jsTypeId: null,
    jsTypeCode: null,
    jsTypeLibelle: null,
    lpaId: null,
    jsDansLpa: null,
    estEnDeplacement: null, // ← signal "LPA n'a pas pu trancher"
    tempsTrajetAllerMin: 0,
    tempsTrajetRetourMin: 0,
    heureDebutReference: "08:00",
    heureFinReference: "16:00",
    heureDebutEffective: "08:00",
    heureFinEffective: "16:00",
    amplitudeEffectiveMin: 480,
    regimeRH: "general",
    indeterminable: true,
    raisonIndeterminable: "Test fixture",
    explication: "Test fixture",
  };
}

// ─── Helper unitaire ──────────────────────────────────────────────────────────

describe("isDeplacementManuelBloquant — règle LPA-aware partagée", () => {
  it("imprevu.deplacement=false → jamais bloquant, quel que soit l'agent", () => {
    expect(isDeplacementManuelBloquant(makeContext(false), false, undefined)).toBe(false);
    expect(isDeplacementManuelBloquant(makeContext(true), false, undefined)).toBe(false);
    expect(isDeplacementManuelBloquant(makeContext(false), false, effSvcLpaDeterminable(true))).toBe(false);
  });

  it("LPA déterminable (estEnDeplacement !== null) → jamais bloquant, l'amplitude jugera", () => {
    // Agent non habilité manuel, mais LPA a pu calculer → laisser passer
    expect(isDeplacementManuelBloquant(makeContext(false), true, effSvcLpaDeterminable(true))).toBe(false);
    expect(isDeplacementManuelBloquant(makeContext(false), true, effSvcLpaDeterminable(false))).toBe(false);
  });

  it("LPA indéterminable + agent non habilité manuel → bloquant", () => {
    expect(isDeplacementManuelBloquant(makeContext(false), true, effSvcLpaIndeterminable())).toBe(true);
  });

  it("LPA indéterminable + agent habilité manuel → laisser passer", () => {
    expect(isDeplacementManuelBloquant(makeContext(true), true, effSvcLpaIndeterminable())).toBe(false);
  });

  it("pas d'effectiveServiceMap (fallback legacy) + agent non habilité → bloquant", () => {
    expect(isDeplacementManuelBloquant(makeContext(false), true, undefined)).toBe(true);
  });

  it("pas d'effectiveServiceMap + agent habilité → laisser passer", () => {
    expect(isDeplacementManuelBloquant(makeContext(true), true, undefined)).toBe(false);
  });
});

// ─── Single-JS ────────────────────────────────────────────────────────────────

describe("preFilterCandidats (single-JS) — déplacement LPA-aware", () => {
  it("agent peutEtreDeplace=false + LPA déterminable → reste éligible", () => {
    const agent = makeAgent(false);
    const effMap = new Map<string, EffectiveServiceInfo>([
      [agent.context.id, effSvcLpaDeterminable(true)],
    ]);
    const { eligible, exclus } = preFilterCandidats(
      [agent],
      makeJs(),
      imprevuDeplacement,
      "agt-source",
      DEFAULT_WORK_RULES_MINUTES,
      effMap,
    );
    expect(eligible).toHaveLength(1);
    expect(exclus).toHaveLength(0);
  });

  it("agent peutEtreDeplace=false + LPA indéterminable → exclu", () => {
    const agent = makeAgent(false);
    const effMap = new Map<string, EffectiveServiceInfo>([
      [agent.context.id, effSvcLpaIndeterminable()],
    ]);
    const { eligible, exclus } = preFilterCandidats(
      [agent],
      makeJs(),
      imprevuDeplacement,
      "agt-source",
      DEFAULT_WORK_RULES_MINUTES,
      effMap,
    );
    expect(eligible).toHaveLength(0);
    expect(exclus).toHaveLength(1);
    expect(exclus[0].raison).toBe("Non autorisé déplacement (mode manuel)");
  });

  it("agent peutEtreDeplace=true → toujours éligible (LPA ou non)", () => {
    const agent = makeAgent(true);
    const effMap = new Map<string, EffectiveServiceInfo>([
      [agent.context.id, effSvcLpaIndeterminable()],
    ]);
    const { eligible } = preFilterCandidats(
      [agent],
      makeJs(),
      imprevuDeplacement,
      "agt-source",
      DEFAULT_WORK_RULES_MINUTES,
      effMap,
    );
    expect(eligible).toHaveLength(1);
  });

  it("imprevu.deplacement=false → agent peutEtreDeplace=false reste éligible", () => {
    const agent = makeAgent(false);
    const { eligible } = preFilterCandidats(
      [agent],
      makeJs(),
      imprevuSansDeplacement,
      "agt-source",
      DEFAULT_WORK_RULES_MINUTES,
    );
    expect(eligible).toHaveLength(1);
  });

  it("fallback legacy (pas d'effectiveServiceMap) + agent non habilité → exclu", () => {
    const agent = makeAgent(false);
    const { eligible, exclus } = preFilterCandidats(
      [agent],
      makeJs(),
      imprevuDeplacement,
      "agt-source",
      DEFAULT_WORK_RULES_MINUTES,
      undefined, // ← pas de map LPA
    );
    expect(eligible).toHaveLength(0);
    expect(exclus[0].raison).toBe("Non autorisé déplacement (mode manuel)");
  });
});

// ─── Multi-JS — alignement sur single-JS ──────────────────────────────────────

describe("trouverCandidatsPourJs (multi-JS) — déplacement LPA-aware aligné sur single-JS", () => {
  it("agent peutEtreDeplace=false + LPA déterminable → candidat retenu (avant C4 : exclu)", () => {
    const agent = makeAgentMulti(false);
    const js = makeJs();
    const effMap = new Map<string, EffectiveServiceInfo>([
      [`${agent.context.id}:${js.planningLigneId}`, effSvcLpaDeterminable(true)],
    ]);
    const { candidats, exclusions } = trouverCandidatsPourJs(
      js,
      [agent],
      "all_agents",
      DEFAULT_WORK_RULES_MINUTES,
      true,                 // remplacement
      true,                 // deplacement = true → cas pivot
      effMap,
    );
    expect(candidats).toHaveLength(1);
    expect(exclusions.some((e) => e.regle === "DEPLACEMENT_HABILITATION")).toBe(false);
  });

  it("agent peutEtreDeplace=false + LPA indéterminable → exclu (alignement single-JS)", () => {
    const agent = makeAgentMulti(false);
    const js = makeJs();
    const effMap = new Map<string, EffectiveServiceInfo>([
      [`${agent.context.id}:${js.planningLigneId}`, effSvcLpaIndeterminable()],
    ]);
    const { candidats, exclusions } = trouverCandidatsPourJs(
      js,
      [agent],
      "all_agents",
      DEFAULT_WORK_RULES_MINUTES,
      true,
      true,
      effMap,
    );
    expect(candidats).toHaveLength(0);
    expect(exclusions.some((e) => e.regle === "DEPLACEMENT_HABILITATION")).toBe(true);
  });

  it("deplacement=false → pas de filtrage sur peutEtreDeplace (comportement legacy)", () => {
    const agent = makeAgentMulti(false);
    const { candidats, exclusions } = trouverCandidatsPourJs(
      makeJs(),
      [agent],
      "all_agents",
      DEFAULT_WORK_RULES_MINUTES,
      true,
      false, // ← deplacement = false
    );
    expect(candidats).toHaveLength(1);
    expect(exclusions.some((e) => e.regle === "DEPLACEMENT_HABILITATION")).toBe(false);
  });

  it("pas d'effectiveServiceMap (legacy) + deplacement=true + agent non habilité → exclu", () => {
    const agent = makeAgentMulti(false);
    const { candidats, exclusions } = trouverCandidatsPourJs(
      makeJs(),
      [agent],
      "all_agents",
      DEFAULT_WORK_RULES_MINUTES,
      true,
      true,
      undefined,
    );
    expect(candidats).toHaveLength(0);
    expect(exclusions.some((e) => e.regle === "DEPLACEMENT_HABILITATION")).toBe(true);
  });
});

// ─── Cohérence transverse single-JS / multi-JS ────────────────────────────────

describe("cohérence single-JS / multi-JS — même décision sur les mêmes inputs", () => {
  const cas: Array<{
    label: string;
    peutEtreDeplace: boolean;
    effSvc: EffectiveServiceInfo | "missing";
    deplacementImprevu: boolean;
    attenduRetenu: boolean;
  }> = [
    { label: "LPA déterminable + agent non habilité", peutEtreDeplace: false, effSvc: effSvcLpaDeterminable(true),  deplacementImprevu: true,  attenduRetenu: true  },
    { label: "LPA indéterminable + agent non habilité", peutEtreDeplace: false, effSvc: effSvcLpaIndeterminable(), deplacementImprevu: true,  attenduRetenu: false },
    { label: "LPA indéterminable + agent habilité",     peutEtreDeplace: true,  effSvc: effSvcLpaIndeterminable(), deplacementImprevu: true,  attenduRetenu: true  },
    { label: "imprevu.deplacement=false",                peutEtreDeplace: false, effSvc: "missing",                 deplacementImprevu: false, attenduRetenu: true  },
    { label: "fallback legacy + agent non habilité",     peutEtreDeplace: false, effSvc: "missing",                 deplacementImprevu: true,  attenduRetenu: false },
  ];

  it.each(cas)("$label → single-JS et multi-JS prennent la même décision (retenu=$attenduRetenu)", ({ peutEtreDeplace, effSvc, deplacementImprevu, attenduRetenu }) => {
    const js = makeJs();
    const imprevu: ImpreuvuConfig = { ...imprevuDeplacement, deplacement: deplacementImprevu };

    const agentSingle = makeAgent(peutEtreDeplace);
    const agentMulti = makeAgentMulti(peutEtreDeplace);

    const effMapSingle = effSvc === "missing" ? undefined : new Map([[agentSingle.context.id, effSvc]]);
    const effMapMulti  = effSvc === "missing" ? undefined : new Map([[`${agentMulti.context.id}:${js.planningLigneId}`, effSvc]]);

    const { eligible: eligibleSingle } = preFilterCandidats(
      [agentSingle], js, imprevu, "agt-source", DEFAULT_WORK_RULES_MINUTES, effMapSingle,
    );
    const { candidats: candidatsMulti } = trouverCandidatsPourJs(
      js, [agentMulti], "all_agents", DEFAULT_WORK_RULES_MINUTES,
      true, deplacementImprevu, effMapMulti,
    );

    const singleRetenu = eligibleSingle.length > 0;
    const multiRetenu  = candidatsMulti.length > 0;

    expect(singleRetenu).toBe(attenduRetenu);
    expect(multiRetenu).toBe(attenduRetenu);
    expect(singleRetenu).toBe(multiRetenu);
  });
});

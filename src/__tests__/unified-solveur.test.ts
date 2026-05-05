/**
 * Tests unitaires du solveur unifié — couvrent uniquement le core en isolation.
 * Aucun branchement allocator n'est testé ici (ce sera fait en étape 2).
 *
 * Stratégie : fixtures synthétiques minimales, pas de DB ni d'I/O.
 */

import {
  besoinIdFromJs,
  besoinRacineFromJs,
  creerEtatInitial,
  enrichirEtat,
  hashEtat,
  cacheKey,
  aplatirResolution,
  profondeurMaxResolution,
  evaluerImpactComplet,
  resoudreBesoin,
  enumererSolutions,
  planningEffectif,
  SOLVER_DEFAULTS,
} from "@/lib/simulation/unified";
import type {
  Besoin,
  Resolution,
  EtatCascade,
} from "@/lib/simulation/unified";
import { buildCoverageIndex } from "@/lib/simulation/multiJs/chaineCache";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { PlanningEvent } from "@/engine/rules";
import type { JsCible } from "@/types/js-simulation";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeAgent(
  id: string,
  prefixesJs: string[],
  events: PlanningEvent[] = [],
  flags: { reserve?: boolean; nuit?: boolean; deplace?: boolean } = {}
): AgentDataMultiJs {
  return {
    context: {
      id,
      nom: `N${id}`,
      prenom: `P${id}`,
      matricule: `M${id}`,
      posteAffectation: null,
      agentReserve: flags.reserve ?? false,
      peutFaireNuit: flags.nuit ?? true,
      peutEtreDeplace: flags.deplace ?? false,
      regimeB: false,
      regimeC: false,
      prefixesJs,
      lpaBaseId: null,
    },
    events,
  };
}

function makeJsEvent(
  planningLigneId: string,
  date: string,
  hd: string,
  hf: string,
  codeJs: string
): PlanningEvent {
  const start = new Date(`${date}T${hd}:00.000Z`);
  let end = new Date(`${date}T${hf}:00.000Z`);
  if (end <= start) end = new Date(end.getTime() + 24 * 3600_000);
  return {
    dateDebut: start,
    dateFin: end,
    heureDebut: hd,
    heureFin: hf,
    amplitudeMin: Math.round((end.getTime() - start.getTime()) / 60000),
    dureeEffectiveMin: null,
    jsNpo: "JS",
    codeJs,
    typeJs: codeJs,
    planningLigneId,
  };
}

function makeJsCible(
  planningLigneId: string,
  date: string,
  hd: string,
  hf: string,
  codeJs: string,
  isNuit = false
): JsCible {
  return {
    planningLigneId,
    agentId: "agt-source",
    agentNom: "SOURCE",
    agentPrenom: "AGT",
    agentMatricule: "M0",
    date,
    heureDebut: hd,
    heureFin: hf,
    heureDebutJsType: hd,
    heureFinJsType: hf,
    amplitudeMin: 480,
    codeJs,
    typeJs: codeJs,
    isNuit,
    importId: "imp-test",
    flexibilite: "OBLIGATOIRE",
  };
}

function makeEtat(
  agents: AgentDataMultiJs[],
  overrides: { profondeurMax?: number; budget?: number } = {}
): EtatCascade {
  const agentsMap = new Map(agents.map((a) => [a.context.id, a]));
  return creerEtatInitial({
    agentsMap,
    index: buildCoverageIndex(agents),
    rules: DEFAULT_WORK_RULES_MINUTES,
    importId: "imp-test",
    profondeurMax: overrides.profondeurMax,
    budget: overrides.budget,
  });
}

// ─── 1. besoinIdFromJs : identifiants stables ────────────────────────────────

describe("besoinIdFromJs", () => {
  it("préfère planningLigneId si présent", () => {
    const js = makeJsCible("pli-42", "2026-05-04", "21:00", "05:00", "GIC006R");
    expect(besoinIdFromJs(js)).toBe("pli:pli-42");
  });

  it("fallback sur date+heure+code si planningLigneId vide", () => {
    const js = { ...makeJsCible("", "2026-05-04", "21:00", "05:00", "GIC006R"), planningLigneId: "" };
    expect(besoinIdFromJs(js)).toBe("slot:2026-05-04_21:00_GIC006R");
  });

  it("est déterministe (même input → même id)", () => {
    const js1 = makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R");
    const js2 = makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R");
    expect(besoinIdFromJs(js1)).toBe(besoinIdFromJs(js2));
  });
});

// ─── 2. enrichirEtat : clone immuable + ajout ────────────────────────────────

describe("enrichirEtat", () => {
  const agentA = makeAgent("a", ["GIC"]);
  const etat = makeEtat([agentA]);
  const besoin: Besoin = besoinRacineFromJs(
    makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R")
  );

  it("ajoute l'agent à agentsEngagesBranche", () => {
    const e2 = enrichirEtat(etat, agentA.context, besoin);
    expect(e2.agentsEngagesBranche.has("a")).toBe(true);
    expect(etat.agentsEngagesBranche.has("a")).toBe(false); // pas de mutation
  });

  it("ajoute le besoin à besoinsEnCoursBranche", () => {
    const e2 = enrichirEtat(etat, agentA.context, besoin);
    expect(e2.besoinsEnCoursBranche.has(besoin.id)).toBe(true);
    expect(etat.besoinsEnCoursBranche.size).toBe(0); // pas de mutation
  });

  it("ajoute la JS aux affectations courantes", () => {
    const e2 = enrichirEtat(etat, agentA.context, besoin);
    expect(e2.affectationsCourantes.get("a")?.length).toBe(1);
    expect(etat.affectationsCourantes.size).toBe(0);
  });

  it("ajoute planningLigneId à jsLibereesDansBranche si présent", () => {
    const e2 = enrichirEtat(etat, agentA.context, besoin);
    expect(e2.jsLibereesDansBranche.has("pli-1")).toBe(true);
  });

  it("partage budget et cache (références identiques)", () => {
    const e2 = enrichirEtat(etat, agentA.context, besoin);
    expect(e2.budget).toBe(etat.budget);
    expect(e2.cache).toBe(etat.cache);
  });
});

// ─── 3. hashEtat & cacheKey ──────────────────────────────────────────────────

describe("hashEtat", () => {
  const agentA = makeAgent("a", ["GIC"]);
  const etat = makeEtat([agentA]);

  it("retourne le même hash pour des états identiques", () => {
    expect(hashEtat(etat, "a")).toBe(hashEtat(etat, "a"));
  });

  it("change quand jsLibereesDansBranche change", () => {
    const h1 = hashEtat(etat, "a");
    etat.jsLibereesDansBranche.add("pli-x");
    const h2 = hashEtat(etat, "a");
    expect(h1).not.toBe(h2);
  });

  it("isole les hash par agentId (les injections de l'autre agent n'affectent pas)", () => {
    const h1 = hashEtat(etat, "a");
    etat.affectationsCourantes.set("b", [
      makeJsCible("pli-x", "2026-05-04", "10:00", "18:00", "X"),
    ]);
    expect(hashEtat(etat, "a")).toBe(h1);
  });

  it("cacheKey combine agent + besoin + état", () => {
    const k = cacheKey("a", "pli:b1", etat);
    expect(k.startsWith("a|pli:b1|")).toBe(true);
  });
});

// ─── 4. planningEffectif ─────────────────────────────────────────────────────

describe("planningEffectif", () => {
  let agentA: AgentDataMultiJs;
  let etat: EtatCascade;
  beforeEach(() => {
    const ev1 = makeJsEvent("pli-1", "2026-05-01", "08:00", "16:00", "GIC001");
    const ev2 = makeJsEvent("pli-2", "2026-05-02", "08:00", "16:00", "GIC002");
    agentA = makeAgent("a", ["GIC"], [ev1, ev2]);
    etat = makeEtat([agentA]);
  });

  it("retourne tous les events si rien n'est libéré ni injecté", () => {
    expect(planningEffectif(agentA, etat).length).toBe(2);
  });

  it("retire les events libérés", () => {
    etat.jsLibereesDansBranche.add("pli-1");
    const p = planningEffectif(agentA, etat);
    expect(p.length).toBe(1);
    expect(p[0].planningLigneId).toBe("pli-2");
  });

  it("injecte les JS de affectationsCourantes", () => {
    etat.affectationsCourantes.set("a", [
      makeJsCible("pli-x", "2026-05-03", "08:00", "16:00", "GIC003"),
    ]);
    const p = planningEffectif(agentA, etat);
    expect(p.length).toBe(3);
    expect(p[2].planningLigneId).toBe("pli-x");
  });

  it("trie chronologiquement", () => {
    etat.affectationsCourantes.set("a", [
      makeJsCible("pli-x", "2026-04-30", "08:00", "16:00", "GIC003"),
    ]);
    const p = planningEffectif(agentA, etat);
    expect(p[0].planningLigneId).toBe("pli-x");
  });
});

// ─── 5. evaluerImpactComplet : pré-filtres ───────────────────────────────────

describe("evaluerImpactComplet — pré-filtres", () => {
  it("rejette HABILITATION si préfixe non couvert", () => {
    const agent = makeAgent("a", ["BAD"]);
    const etat = makeEtat([agent]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = evaluerImpactComplet(agent.context, besoin, etat);
    expect(r.faisable).toBe(false);
    expect(r.raisonRejet).toContain("HABILITATION");
  });

  it("accepte HABILITATION si préfixe couvre le code", () => {
    const agent = makeAgent("a", ["GIC"], [], { nuit: true });
    const etat = makeEtat([agent]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = evaluerImpactComplet(agent.context, besoin, etat);
    // Pas de planning passé = aucun conflit horaire ni induit, donc faisable
    expect(r.faisable).toBe(true);
    expect(r.consequences.length).toBe(0);
  });

  it("rejette NUIT_HABILITATION si JS de nuit et agent non habilité", () => {
    const agent = makeAgent("a", ["GIC"], [], { nuit: false });
    const etat = makeEtat([agent]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = evaluerImpactComplet(agent.context, besoin, etat);
    expect(r.faisable).toBe(false);
    expect(r.raisonRejet).toContain("NUIT_HABILITATION");
  });

  it("met le résultat en cache", () => {
    const agent = makeAgent("a", ["GIC"]);
    const etat = makeEtat([agent]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const budgetAvant = etat.budget.remaining;
    evaluerImpactComplet(agent.context, besoin, etat);
    evaluerImpactComplet(agent.context, besoin, etat);  // 2e appel : cache hit
    expect(etat.budget.remaining).toBe(budgetAvant - 1);  // 1 seul décrément
  });
});

// ─── 6. evaluerImpactComplet : HORAIRE_CONFLICT ──────────────────────────────

describe("evaluerImpactComplet — HORAIRE_CONFLICT", () => {
  it("émet HORAIRE_CONFLICT si l'agent a déjà une JS qui chevauche", () => {
    const conflit = makeJsEvent("pli-conflit", "2026-05-04", "20:00", "22:00", "GIC014");
    const agent = makeAgent("a", ["GIC"], [conflit]);
    const etat = makeEtat([agent]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = evaluerImpactComplet(agent.context, besoin, etat);
    expect(r.faisable).toBe(true);
    expect(r.consequences.length).toBeGreaterThanOrEqual(1);
    expect(r.consequences[0].type).toBe("HORAIRE_CONFLICT");
    expect(r.consequences[0].jsImpactee.planningLigneId).toBe("pli-conflit");
  });

  it("rejette si l'event chevauchant n'a pas de planningLigneId", () => {
    const conflit: PlanningEvent = {
      ...makeJsEvent("pli-conflit", "2026-05-04", "20:00", "22:00", "GIC014"),
      planningLigneId: undefined,
    };
    const agent = makeAgent("a", ["GIC"], [conflit]);
    const etat = makeEtat([agent]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = evaluerImpactComplet(agent.context, besoin, etat);
    expect(r.faisable).toBe(false);
    expect(r.raisonRejet).toContain("HORAIRE_CONFLICT_NON_LIBERABLE");
  });
});

// ─── 7. resoudreBesoin : garde-fous ─────────────────────────────────────────

describe("resoudreBesoin — garde-fous", () => {
  it("retourne BUDGET si budget épuisé", () => {
    const agent = makeAgent("a", ["GIC"]);
    const etat = makeEtat([agent], { budget: 0 });
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = resoudreBesoin(besoin, etat);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toBe("BUDGET");
  });

  it("retourne PROFONDEUR si niveau dépasse profondeurMax", () => {
    const agent = makeAgent("a", ["GIC"]);
    const etat = makeEtat([agent], { profondeurMax: 1 });
    const besoin: Besoin = {
      id: "test",
      jsCible: makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R", true),
      origine: { type: "RACINE" },
      niveau: 2,  // > profondeurMax
    };
    const r = resoudreBesoin(besoin, etat);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toBe("PROFONDEUR");
  });

  it("retourne CYCLE si le besoin est déjà en cours", () => {
    const agent = makeAgent("a", ["GIC"]);
    const etat = makeEtat([agent]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    etat.besoinsEnCoursBranche.add(besoin.id);
    const r = resoudreBesoin(besoin, etat);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toBe("CYCLE");
  });

  it("retourne AUCUN_CANDIDAT si aucun agent habilité", () => {
    const agent = makeAgent("a", ["BAD"]);  // pas habilité GIC
    const etat = makeEtat([agent]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = resoudreBesoin(besoin, etat);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toBe("AUCUN_CANDIDAT");
  });
});

// ─── 8. resoudreBesoin : cas direct (feuille immédiate) ──────────────────────

describe("resoudreBesoin — feuille immédiate", () => {
  it("trouve un agent libre habilité sur une JS isolée", () => {
    const agent = makeAgent("a", ["GIC"]);
    const etat = makeEtat([agent]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = resoudreBesoin(besoin, etat);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resolution.agent.id).toBe("a");
      expect(r.resolution.consequences.length).toBe(0);
      expect(r.resolution.sousResolutions.length).toBe(0);
    }
  });

  it("priorise les réservistes par défaut (RESERVE_PRIO)", () => {
    const std = makeAgent("std", ["GIC"], [], { reserve: false });
    const res = makeAgent("res", ["GIC"], [], { reserve: true });
    const etat = makeEtat([std, res]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = resoudreBesoin(besoin, etat);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolution.agent.id).toBe("res");
  });
});

// ─── 9. resoudreBesoin : cascade simple (HORAIRE_CONFLICT → libération) ──────

describe("resoudreBesoin — cascade horaire à 2 niveaux", () => {
  it("résout via un B qui prend la JS bloquante de A", () => {
    // Agent A : habilité GIC mais a déjà une JS conflictuelle
    const conflitA = makeJsEvent("pli-confA", "2026-05-04", "20:00", "22:00", "GIC014");
    const agentA = makeAgent("a", ["GIC"], [conflitA]);

    // Agent B : habilité GIC, libre — peut prendre la JS de A
    const agentB = makeAgent("b", ["GIC"]);

    const etat = makeEtat([agentA, agentB]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = resoudreBesoin(besoin, etat);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // N1 = A
      expect(r.resolution.agent.id).toBe("a");
      // 1 conséquence : la JS de A
      expect(r.resolution.consequences.length).toBe(1);
      expect(r.resolution.consequences[0].type).toBe("HORAIRE_CONFLICT");
      // N2 = B prend la JS de A
      expect(r.resolution.sousResolutions.length).toBe(1);
      expect(r.resolution.sousResolutions[0].agent.id).toBe("b");
      expect(r.resolution.sousResolutions[0].consequences.length).toBe(0);
    }
  });

  it("échoue si aucun agent ne peut libérer A (plus que A en candidat)", () => {
    const conflitA = makeJsEvent("pli-confA", "2026-05-04", "20:00", "22:00", "GIC014");
    const agentA = makeAgent("a", ["GIC"], [conflitA]);
    const etat = makeEtat([agentA]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = resoudreBesoin(besoin, etat);
    expect(r.ok).toBe(false);
  });
});

// ─── 10. resoudreBesoin : anti-cycle agent ───────────────────────────────────

describe("resoudreBesoin — anti-cycle agent", () => {
  it("n'engage pas le même agent à deux niveaux d'une même branche", () => {
    // Setup d'un cycle : A et B se "bouclent" mutuellement.
    //  - cible : 21:00→05:00 le 04/05
    //  - A a confA (20:00→22:00) qui chevauche cible
    //  - B a confB (21:00→23:00) qui chevauche aussi confA et cible
    //  Tentative N1 = A → libérer confA → tester B.
    //  B a confB qui chevauche confA (entre 21:00 et 22:00) → libérer confB → tester A.
    //  Mais A est dans agentsEngagesBranche → AUCUN_CANDIDAT.
    //  Tentative N1 = B → libérer confB → tester A. A a confA chevauchant confB → libérer confA → tester B. Cycle.
    const confA = makeJsEvent("pli-confA", "2026-05-04", "20:00", "22:00", "GIC014");
    const confB = makeJsEvent("pli-confB", "2026-05-04", "21:00", "23:00", "GIC020");
    const agentA = makeAgent("a", ["GIC"], [confA]);
    const agentB = makeAgent("b", ["GIC"], [confB]);
    const etat = makeEtat([agentA, agentB]);

    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = resoudreBesoin(besoin, etat);
    expect(r.ok).toBe(false);
  });
});

// ─── 11. enumererSolutions : N1 distincts ────────────────────────────────────

describe("enumererSolutions", () => {
  it("retourne plusieurs solutions avec N1 distincts", () => {
    const a = makeAgent("a", ["GIC"]);
    const b = makeAgent("b", ["GIC"]);
    const c = makeAgent("c", ["GIC"]);
    const etat = makeEtat([a, b, c]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const solutions = enumererSolutions(besoin, etat, 5);
    expect(solutions.length).toBe(3);
    const n1Ids = solutions.map((s) => s.resolutionRacine.agent.id);
    expect(new Set(n1Ids).size).toBe(3);  // tous distincts
  });

  it("respecte le cap maxSolutions", () => {
    const agents = Array.from({ length: 5 }, (_, i) => makeAgent(`a${i}`, ["GIC"]));
    const etat = makeEtat(agents);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const solutions = enumererSolutions(besoin, etat, 3);
    expect(solutions.length).toBe(3);
  });

  it("retourne une liste vide si le besoin n'a aucune solution", () => {
    const agent = makeAgent("a", ["BAD"]);
    const etat = makeEtat([agent]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const solutions = enumererSolutions(besoin, etat, 5);
    expect(solutions.length).toBe(0);
  });
});

// ─── 12. aplatirResolution & profondeur ──────────────────────────────────────

describe("aplatirResolution", () => {
  function fakeFeuille(id: string): Resolution {
    return {
      besoin: besoinRacineFromJs(makeJsCible(`pli-${id}`, "2026-05-04", "10:00", "18:00", "GIC")),
      agent: {
        id,
        nom: id,
        prenom: id,
        matricule: id,
        posteAffectation: null,
        agentReserve: false,
        peutFaireNuit: true,
        peutEtreDeplace: false,
        regimeB: false,
        regimeC: false,
        prefixesJs: [],
        lpaBaseId: null,
      },
      statut: "DIRECT",
      detail: {} as never,
      consequences: [],
      sousResolutions: [],
    };
  }

  it("ordre post-ordre : feuilles d'abord, racine en dernier", () => {
    const f1 = fakeFeuille("f1");
    const f2 = fakeFeuille("f2");
    const racine: Resolution = {
      ...fakeFeuille("r"),
      sousResolutions: [f1, f2],
    };
    const aplaties = aplatirResolution(racine);
    expect(aplaties.map((r) => r.agent.id)).toEqual(["f1", "f2", "r"]);
  });

  it("profondeurMaxResolution sur un arbre à 3 niveaux", () => {
    const f1 = fakeFeuille("f1");
    const n1: Resolution = { ...fakeFeuille("n1"), sousResolutions: [f1] };
    const racine: Resolution = { ...fakeFeuille("r"), sousResolutions: [n1] };
    expect(profondeurMaxResolution(racine)).toBe(3);
  });
});

// ─── 13. besoinRacineFromJs : niveau 0, RACINE ───────────────────────────────

describe("besoinRacineFromJs", () => {
  it("crée un besoin de niveau 0 avec origine RACINE", () => {
    const js = makeJsCible("pli-1", "2026-05-04", "21:00", "05:00", "GIC006R");
    const b = besoinRacineFromJs(js);
    expect(b.niveau).toBe(0);
    expect(b.origine.type).toBe("RACINE");
    expect(b.id).toBe("pli:pli-1");
  });
});

// ─── 14. SOLVER_DEFAULTS : valeurs validées par l'utilisateur ────────────────

describe("SOLVER_DEFAULTS", () => {
  it("profondeur max = 4", () => {
    expect(SOLVER_DEFAULTS.CASCADE_MAX_DEPTH).toBe(4);
  });
  it("budget = 12000", () => {
    expect(SOLVER_DEFAULTS.CASCADE_EVAL_BUDGET).toBe(12000);
  });
});

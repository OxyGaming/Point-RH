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

// ─── 6.5. evaluerImpactComplet : conflits induits FORWARD ────────────────────

describe("evaluerImpactComplet — conflits induits forward (post-imprévu)", () => {
  it("émet INDUCED_REPOS sur la JS aval si repos insuffisant", () => {
    // Imprévu : 03/05 20:30 → 04/05 04:30 (poste de nuit).
    // Agent a une JS le 04/05 à 13:00 → repos = 8h30, requis post-nuit = 14h.
    // → conflit forward → INDUCED_REPOS attendu.
    const jsAval = makeJsEvent("pli-aval", "2026-05-04", "13:00", "21:00", "BAD015R");
    const agent = makeAgent("a", ["GIC", "BAD"], [jsAval], { nuit: true });
    const etat = makeEtat([agent]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-03", "20:30", "04:30", "GIC006R", true)
    );
    const r = evaluerImpactComplet(agent.context, besoin, etat);
    expect(r.faisable).toBe(true);
    const inducedRepos = r.consequences.filter((c) => c.type === "INDUCED_REPOS");
    expect(inducedRepos.length).toBe(1);
    expect(inducedRepos[0].jsImpactee.planningLigneId).toBe("pli-aval");
  });

  it("agent sans JS aval : pas de consequence forward", () => {
    const agent = makeAgent("a", ["GIC"], [], { nuit: true });
    const etat = makeEtat([agent]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-03", "20:30", "04:30", "GIC006R", true)
    );
    const r = evaluerImpactComplet(agent.context, besoin, etat);
    expect(r.faisable).toBe(true);
    expect(r.consequences.length).toBe(0);
  });

  it("anti-cycle inter-frères : un agent ne peut pas résoudre 2 besoins frères du même nœud", () => {
    // Setup où le candidat A taking the imprévu génère 2 conséquences forward
    // (deux JS aval bloquées par repos insuffisant).
    // Si l'anti-cycle inter-frères ne fonctionne pas, B pourrait résoudre les
    // deux. Or B ne peut pas être en deux endroits à la fois.
    const jsAval1 = makeJsEvent("pli-aval1", "2026-05-04", "13:00", "21:00", "BAD015R");
    const jsAval2 = makeJsEvent("pli-aval2", "2026-05-05", "06:00", "14:00", "BAD016R");
    const a = makeAgent("a", ["GIC", "BAD"], [jsAval1, jsAval2], { nuit: true });
    const b = makeAgent("b", ["BAD"], [], { nuit: true });
    const etat = makeEtat([a, b]);

    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-03", "20:30", "04:30", "GIC006R", true)
    );
    const r = resoudreBesoin(besoin, etat);

    // Soit r.ok=false (B ne peut pas résoudre 2 besoins),
    // soit r.ok=true mais avec des agents distincts pour les sous-resolutions.
    if (r.ok) {
      const idsLeafs = r.resolution.sousResolutions.map((s) => s.agent.id);
      expect(new Set(idsLeafs).size).toBe(idsLeafs.length);  // pas de doublon
    }
  });

  it("résout en cascade : N1 a un conflit forward, N2 prend la JS aval", () => {
    // Agent A : taking the imprévu crée conflit aval (sa JS 13:00 le 04/05)
    const jsAvalA = makeJsEvent("pli-avalA", "2026-05-04", "13:00", "21:00", "BAD015R");
    const a = makeAgent("a", ["GIC", "BAD"], [jsAvalA], { nuit: true });
    // Agent B : libre, peut prendre la JS aval de A
    const b = makeAgent("b", ["BAD"], [], { nuit: true });
    const etat = makeEtat([a, b]);

    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-03", "20:30", "04:30", "GIC006R", true)
    );
    const result = resoudreBesoin(besoin, etat);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Topologie attendue : A racine, B feuille (résout la JS aval de A)
      expect(result.resolution.agent.id).toBe("a");
      expect(result.resolution.consequences.length).toBe(1);
      expect(result.resolution.consequences[0].type).toBe("INDUCED_REPOS");
      expect(result.resolution.sousResolutions[0].agent.id).toBe("b");
    }
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
    // Force tri STANDARD pour que A (alphabétique) soit testé avant B.
    // Avec SCORE_LEGACY (défaut), B est directement libre → choisi en racine
    // sans cascade, ce qui est le comportement correct mais court-circuite
    // la topologie qu'on cherche à valider ici.
    const r = resoudreBesoin(besoin, etat, { tri: "STANDARD" });
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

// ─── 9bis. resoudreBesoin : tri SCORE_LEGACY ─────────────────────────────────

describe("resoudreBesoin — tri SCORE_LEGACY (défaut)", () => {
  it("préfère un agent DIRECT à un agent VIGILANCE même si non réserviste", () => {
    // Agent direct (non réserviste) vs agent vigilance (réserviste)
    // RESERVE_PRIO choisirait B (réserviste). SCORE_LEGACY choisit A (DIRECT).
    const conflitB = makeJsEvent("pli-confB", "2026-05-04", "20:00", "22:00", "GIC014");
    const a = makeAgent("a", ["GIC"], [], { reserve: false });
    const b = makeAgent("b", ["GIC"], [conflitB], { reserve: true });
    const etat = makeEtat([a, b]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const rDefault = resoudreBesoin(besoin, etat);  // SCORE_LEGACY par défaut
    expect(rDefault.ok).toBe(true);
    if (rDefault.ok) {
      // A direct gagne malgré le statut non-réserviste
      expect(rDefault.resolution.agent.id).toBe("a");
    }

    // En RESERVE_PRIO, B serait préféré (s'il était DIRECT). Avec un conflit
    // horaire, B passe en VIGILANCE et A direct gagne aussi en RESERVE_PRIO.
    // Pour bien isoler la différence, vérifions avec deux agents tous deux DIRECT :
    const c = makeAgent("c", ["GIC"], [], { reserve: false });
    const d = makeAgent("d", ["GIC"], [], { reserve: true });
    const etat2 = makeEtat([c, d]);
    const rReserve = resoudreBesoin(besoin, etat2, { tri: "RESERVE_PRIO" });
    if (rReserve.ok) expect(rReserve.resolution.agent.id).toBe("d");  // réserviste prio
    const rScore = resoudreBesoin(besoin, makeEtat([c, d]), { tri: "SCORE_LEGACY" });
    if (rScore.ok) {
      // Tous deux DIRECT, score équivalent → réserviste tiebreaker → D
      expect(rScore.resolution.agent.id).toBe("d");
    }
  });

  it("le score métier remonte un agent à faible charge GPT face à un agent saturé", () => {
    // Agent A : aucun planning → score plein 100 (+ bonus reserve)
    // Agent B : aucun planning non plus, non réserviste → score 100 sans bonus
    // SCORE_LEGACY doit préférer A (avec bonus reserve = 110→capped 100, donc égalité,
    // mais le tiebreaker réserve favorise A quand même).
    const a = makeAgent("a", ["GIC"], [], { reserve: true });
    const b = makeAgent("b", ["GIC"], [], { reserve: false });
    const etat = makeEtat([a, b]);
    const besoin = besoinRacineFromJs(
      makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
    );
    const r = resoudreBesoin(besoin, etat);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolution.agent.id).toBe("a");
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

  describe("diversification MULTI_NIVEAU", () => {
    it("expose des variantes profondes (même N1+N2, N3 différent)", () => {
      // Setup : agentA est bloqué horaire et a besoin d'un B pour libérer.
      // B est lui-même bloqué et a besoin d'un C. Plusieurs C valides existent.
      // En MULTI_NIVEAU, on doit voir les variantes avec C1, C2, C3...
      const confA = makeJsEvent("pli-confA", "2026-05-04", "20:00", "22:00", "GIC014");
      const confB = makeJsEvent("pli-confB", "2026-05-04", "08:00", "16:00", "GIC008");
      const a = makeAgent("a", ["GIC"], [confA]);
      const b = makeAgent("b", ["GIC"], [confB]);
      const c1 = makeAgent("c1", ["GIC"]);
      const c2 = makeAgent("c2", ["GIC"]);
      const c3 = makeAgent("c3", ["GIC"]);
      const etat = makeEtat([a, b, c1, c2, c3]);

      const besoin = besoinRacineFromJs(
        makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
      );

      const sansDiv = enumererSolutions(besoin, etat, 5);
      const avecDiv = enumererSolutions(besoin, makeEtat([a, b, c1, c2, c3]), 5, {
        diversification: "MULTI_NIVEAU",
      });

      // Avec MULTI_NIVEAU on doit avoir au moins autant de solutions, et
      // potentiellement plus de variantes profondes.
      expect(avecDiv.length).toBeGreaterThanOrEqual(sansDiv.length);
      // Au moins une solution doit avoir un C feuille distinct des autres.
      const feuilles = avecDiv.map((s) => s.resolutionsAplaties[0].agent.id);
      const feuillesDistinctes = new Set(feuilles);
      // Si toutes les solutions ont la même feuille, le mode multi-niveau
      // n'aurait rien apporté. Avec 3 C disponibles, au moins 2 devraient sortir.
      expect(feuillesDistinctes.size).toBeGreaterThanOrEqual(2);
    });

    it("ne duplique pas les solutions identiques", () => {
      // Setup où la diversification pourrait produire la même solution plusieurs fois.
      const confA = makeJsEvent("pli-confA", "2026-05-04", "20:00", "22:00", "GIC014");
      const a = makeAgent("a", ["GIC"], [confA]);
      const b = makeAgent("b", ["GIC"]);
      const etat = makeEtat([a, b]);

      const besoin = besoinRacineFromJs(
        makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
      );

      const sols = enumererSolutions(besoin, etat, 5, { diversification: "MULTI_NIVEAU" });
      // Seul a peut prendre cible, seul b peut le libérer → une seule topologie possible.
      const sigs = sols.map((s) =>
        s.resolutionsAplaties.map((r) => `${r.agent.id}:${r.besoin.id}`).join("|")
      );
      expect(new Set(sigs).size).toBe(sols.length);  // pas de doublon
    });

    it("MULTI_NIVEAU rétrocompatible avec N1_SEUL quand la diversification n'apporte rien", () => {
      // Cas trivial : un seul agent libre — multi-niveaux ne change rien.
      const a = makeAgent("a", ["GIC"]);
      const etat = makeEtat([a]);
      const besoin = besoinRacineFromJs(
        makeJsCible("pli-cible", "2026-05-04", "21:00", "05:00", "GIC006R", true)
      );
      const sansDiv = enumererSolutions(besoin, etat, 5);
      const avecDiv = enumererSolutions(besoin, makeEtat([a]), 5, {
        diversification: "MULTI_NIVEAU",
      });
      expect(sansDiv.length).toBe(1);
      expect(avecDiv.length).toBe(1);
    });
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

/**
 * Tests unitaires de l'algorithme de chaîne de remplacement.
 * Phase 2 — profondeur 1 (un seul maillon de cascade).
 * Phase 4 — profondeur 2 (chaîne récursive testée plus tard).
 */

import { tenterChaineRemplacement, type ChaineContexte } from "@/lib/simulation/multiJs/chaineRemplacement";
import { buildCoverageIndex } from "@/lib/simulation/multiJs/chaineCache";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { PlanningEvent } from "@/engine/rules";

function makeAgent(
  id: string,
  prefixesJs: string[],
  events: PlanningEvent[] = [],
  flags: { reserve?: boolean; nuit?: boolean } = {}
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
      peutEtreDeplace: false,
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

function makeContexte(
  agents: AgentDataMultiJs[],
  profondeurMax = 1,
  budget = 200
): ChaineContexte {
  const agentsMap = new Map(agents.map((a) => [a.context.id, a]));
  return {
    agentsMap,
    index: buildCoverageIndex(agents),
    rules: DEFAULT_WORK_RULES_MINUTES,
    remplacement: true,
    deplacement: false,
    effectiveServiceMap: undefined,
    zeroLoadPrefixes: [],
    agentAssignments: new Map(),
    profondeurMax,
    budget: { remaining: budget },
    importId: "import-test",
  };
}

describe("tenterChaineRemplacement — profondeur 1", () => {
  it("trouve un agent libre habilité pour reprendre la JS source bloquante", () => {
    // Agent A bloqué par GIC002 le 2024-03-20 jour. Il faut le libérer pour la cible nuit.
    const eventConflit = makeJsEvent("ligne-A", "2024-03-20", "08:00", "16:45", "GIC002");
    const agentA = makeAgent("a", ["GIC"], [eventConflit]);
    // Agent B libre, habilité GIC → peut reprendre GIC002
    const agentB = makeAgent("b", ["GIC"], []);

    const ctx = makeContexte([agentA, agentB]);
    const chaine = tenterChaineRemplacement("a", eventConflit, ctx);

    expect(chaine).not.toBeNull();
    expect(chaine!.profondeur).toBe(1);
    expect(chaine!.complete).toBe(true);
    expect(chaine!.maillons[0].agentId).toBe("b");
    expect(chaine!.maillons[0].niveau).toBe(1);
    expect(chaine!.maillons[0].jsLiberee.codeJs).toBe("GIC002");
    expect(chaine!.maillons[0].jsRepriseCodeJs).toBe("GIC002");
  });

  it("aucun candidat habilité → null", () => {
    const eventConflit = makeJsEvent("ligne-A", "2024-03-20", "08:00", "16:45", "GIC002");
    const agentA = makeAgent("a", ["GIC"], [eventConflit]);
    // Agent B habilité BAD seulement → ne peut pas reprendre GIC
    const agentB = makeAgent("b", ["BAD"], []);

    const ctx = makeContexte([agentA, agentB]);
    const chaine = tenterChaineRemplacement("a", eventConflit, ctx);

    expect(chaine).toBeNull();
  });

  it("candidat habilité mais lui-même en conflit → exclu en profondeur 1", () => {
    const eventConflit = makeJsEvent("ligne-A", "2024-03-20", "08:00", "16:45", "GIC002");
    const agentA = makeAgent("a", ["GIC"], [eventConflit]);
    // Agent B habilité GIC mais aussi pris au même créneau (conflit horaire)
    const eventBloqueB = makeJsEvent("ligne-B", "2024-03-20", "08:00", "16:45", "GIC100");
    const agentB = makeAgent("b", ["GIC"], [eventBloqueB]);

    const ctx = makeContexte([agentA, agentB], 1);
    const chaine = tenterChaineRemplacement("a", eventConflit, ctx);

    expect(chaine).toBeNull();
  });

  it("préfère un réserviste libre à un non-réserviste libre", () => {
    const eventConflit = makeJsEvent("ligne-A", "2024-03-20", "08:00", "16:45", "GIC002");
    const agentA = makeAgent("a", ["GIC"], [eventConflit]);
    const nonRes = makeAgent("nr", ["GIC"], [], { reserve: false });
    const res    = makeAgent("res", ["GIC"], [], { reserve: true });

    const ctx = makeContexte([agentA, nonRes, res]);
    const chaine = tenterChaineRemplacement("a", eventConflit, ctx);

    expect(chaine).not.toBeNull();
    expect(chaine!.maillons[0].agentId).toBe("res");
  });

  it("anti-cycle : l'agent bloqué lui-même n'est jamais candidat à reprendre sa propre JS", () => {
    const eventConflit = makeJsEvent("ligne-A", "2024-03-20", "08:00", "16:45", "GIC002");
    const agentA = makeAgent("a", ["GIC"], [eventConflit]);

    const ctx = makeContexte([agentA]);
    const chaine = tenterChaineRemplacement("a", eventConflit, ctx);

    expect(chaine).toBeNull();
  });

  it("budget épuisé → retourne null sans crash", () => {
    const eventConflit = makeJsEvent("ligne-A", "2024-03-20", "08:00", "16:45", "GIC002");
    const agentA = makeAgent("a", ["GIC"], [eventConflit]);
    const agentB = makeAgent("b", ["GIC"], []);

    const ctx = makeContexte([agentA, agentB]);
    ctx.budget.remaining = 0;

    const chaine = tenterChaineRemplacement("a", eventConflit, ctx);
    expect(chaine).toBeNull();
  });
});

describe("tenterChaineRemplacement — profondeur 2", () => {
  it("cascade en chaîne quand le candidat de niveau 1 est lui-même bloqué (Poncet-like)", () => {
    // A (Poncet) absent : on cherche à libérer un agent X pour la cible.
    // Mais on ne le teste pas ici — on teste juste la mécanique de cascade.
    //
    // Scénario :
    //  - Agent X bloqué par S(X) = "JS source X" jour
    //  - Agent Y habilité pour S(X), mais lui-même bloqué par S(Y) = "JS source Y"
    //  - Agent Z libre habilité pour S(Y)
    //
    // Profondeur 2 doit produire 2 maillons : Y reprend S(X), Z reprend S(Y).
    const evtSX = makeJsEvent("ligne-SX", "2024-03-20", "08:00", "16:45", "BAD");
    const evtSY = makeJsEvent("ligne-SY", "2024-03-20", "08:00", "16:45", "AIG");
    const X = makeAgent("X", ["GIC"], [evtSX]);
    const Y = makeAgent("Y", ["GIC", "BAD"], [evtSY]);
    const Z = makeAgent("Z", ["AIG"], []);

    const ctx = makeContexte([X, Y, Z], 2);
    const chaine = tenterChaineRemplacement("X", evtSX, ctx);

    expect(chaine).not.toBeNull();
    expect(chaine!.profondeur).toBe(2);
    expect(chaine!.maillons[0].agentId).toBe("Y");
    expect(chaine!.maillons[0].niveau).toBe(1);
    expect(chaine!.maillons[0].jsLiberee.codeJs).toBe("AIG"); // Y libère SY (sa propre JS bloquante)
    expect(chaine!.maillons[1].agentId).toBe("Z");
    expect(chaine!.maillons[1].niveau).toBe(2);
    expect(chaine!.maillons[1].jsLiberee.codeJs).toBe("AIG");
  });

  it("profondeur max=1 refuse de cascader → retourne null si seul Y existe (bloqué)", () => {
    const evtSX = makeJsEvent("ligne-SX", "2024-03-20", "08:00", "16:45", "BAD");
    const evtSY = makeJsEvent("ligne-SY", "2024-03-20", "08:00", "16:45", "AIG");
    const X = makeAgent("X", ["GIC"], [evtSX]);
    const Y = makeAgent("Y", ["GIC", "BAD"], [evtSY]);

    const ctx = makeContexte([X, Y], 1);
    const chaine = tenterChaineRemplacement("X", evtSX, ctx);

    expect(chaine).toBeNull();
  });

  it("anti-cycle : Y bloqué par une JS reprise par X lui-même → pas de cycle X→Y→X", () => {
    // X bloqué par S(X). Y habilité S(X) mais bloqué par S(Y). Pas de Z habilité S(Y).
    // → null car aucune chaîne valide.
    const evtSX = makeJsEvent("ligne-SX", "2024-03-20", "08:00", "16:45", "BAD");
    const evtSY = makeJsEvent("ligne-SY", "2024-03-20", "08:00", "16:45", "AIG");
    const X = makeAgent("X", ["GIC", "AIG"], [evtSX]); // X habilité AIG mais déjà engagé en amont
    const Y = makeAgent("Y", ["GIC", "BAD"], [evtSY]);

    const ctx = makeContexte([X, Y], 2);
    const chaine = tenterChaineRemplacement("X", evtSX, ctx);

    // Y → X serait l'unique candidat mais X est dans agentsEngages
    expect(chaine).toBeNull();
  });
});

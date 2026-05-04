/**
 * Test d'intégration métier — cas Poncet GIC006R 03 mai 2026.
 *
 * Reproduit la cascade terrain (4 mouvements pour couvrir une absence) :
 *   - T. Poncet absent sur GIC006R nuit 20:30→04:30 du 03/04 mai
 *   - Cascade attendue (mode Cascade profondeur 2) :
 *       Chennouf (depuis Badan P1) → GIC006R
 *       Brouillat (depuis aiguilleur) → Badan P1
 *       Leguay (libre Givors Canal) → aiguilleur
 *
 * Garantit que :
 *   1. Le scénario "Tous agents — Direct" reste à 0 % (tous les candidats sont bloqués).
 *   2. Le scénario "Tous agents — Cascade" atteint 100 % via une chaîne de profondeur 2.
 *   3. La chaîne enregistrée contient bien Chennouf → Brouillat → Leguay dans cet ordre.
 */

jest.mock("@/lib/rules/workRulesLoader", () => ({
  loadWorkRules: jest.fn().mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("@/lib/rules/workRules").DEFAULT_WORK_RULES_MINUTES
  ),
}));

jest.mock("@/lib/simulation/npoExclusionLoader", () => ({
  loadNpoExclusionCodes: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/simulation/jsTypeFlexibiliteLoader", () => ({
  loadJsTypeFlexibiliteMap: jest.fn().mockResolvedValue(new Map()),
}));

jest.mock("@/lib/simulation/zeroLoadPrefixLoader", () => ({
  loadZeroLoadPrefixes: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/deplacement/loadLpaContext", () => ({
  loadLpaContext: jest.fn().mockResolvedValue({
    lpas: [],
    jsTypes: [],
    agentRulesMap: new Map(),
  }),
}));

import { executerSimulationMultiJs } from "@/lib/simulation/multiJs";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { JsCible } from "@/types/js-simulation";
import type { PlanningEvent } from "@/engine/rules";

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

function makeAgent(
  id: string,
  nom: string,
  prefixesJs: string[],
  events: PlanningEvent[],
  reserve = false
): AgentDataMultiJs {
  return {
    context: {
      id,
      nom,
      prenom: "Test",
      matricule: `M-${id}`,
      posteAffectation: null,
      agentReserve: reserve,
      peutFaireNuit: true,
      peutEtreDeplace: false,
      regimeB: false,
      regimeC: false,
      prefixesJs,
      lpaBaseId: null,
    },
    events,
  };
}

describe("Cascade Poncet GIC006R 03 mai — chaîne de profondeur 2", () => {
  // JS cible : Poncet absent sur sa GIC006R nuit du 03 mai
  const jsCible: JsCible = {
    planningLigneId: "ligne-poncet-cible",
    agentId: "poncet",
    agentNom: "PONCET",
    agentPrenom: "THIERRY",
    agentMatricule: "7211574T",
    date: "2026-05-03",
    heureDebut: "20:30",
    heureFin: "04:30",
    amplitudeMin: 480,
    codeJs: "GIC006R",
    typeJs: "GIC006R",
    isNuit: true,
    importId: "import-poncet",
    flexibilite: "OBLIGATOIRE",
  };

  // Chennouf : habilité GIC, déjà sur Badan P1 (BAD001) en nuit le même soir
  const eventBadanChennouf = makeJsEvent("ligne-bad", "2026-05-03", "21:00", "05:00", "BAD001");
  const chennouf = makeAgent("chennouf", "CHENNOUF", ["GIC", "BAD"], [eventBadanChennouf]);

  // Brouillat : habilité BAD, déjà sur aiguilleur (AIG001) en nuit le même soir
  const eventAigBrouillat = makeJsEvent("ligne-aig", "2026-05-03", "21:30", "05:30", "AIG001");
  const brouillat = makeAgent("brouillat", "BROUILLAT", ["BAD", "AIG"], [eventAigBrouillat]);

  // Leguay : libre, habilité aiguilleur — c'est le maillon de fin de chaîne
  const leguay = makeAgent("leguay", "LEGUAY", ["AIG"], [], true /* réserviste fictif */);

  const agents = [chennouf, brouillat, leguay];

  it("scénario Tous agents — Direct : aucune couverture (tous bloqués)", async () => {
    const result = await executerSimulationMultiJs([jsCible], agents, "all_agents");

    const tousDirect = result.scenarioTousAgents!;
    expect(tousDirect.tauxCouverture).toBe(0);
    expect(tousDirect.affectations).toHaveLength(0);
  });

  it("scénario Tous agents — Cascade : 100 % via chaîne Chennouf → Brouillat → Leguay", async () => {
    const result = await executerSimulationMultiJs([jsCible], agents, "all_agents");

    const cascade = result.scenarioTousAgentsCascade!;
    expect(cascade.tauxCouverture).toBe(100);
    expect(cascade.affectations).toHaveLength(1);

    const aff = cascade.affectations[0];
    expect(aff.agentNom).toBe("CHENNOUF");
    expect(aff.chaineRemplacement).not.toBeNull();
    expect(aff.chaineRemplacement!.profondeur).toBe(2);
    expect(aff.chaineRemplacement!.complete).toBe(true);

    const m1 = aff.chaineRemplacement!.maillons[0];
    const m2 = aff.chaineRemplacement!.maillons[1];

    // Niveau 1 : Brouillat libère AIG001 pour reprendre BAD001 (laissé par Chennouf)
    expect(m1.niveau).toBe(1);
    expect(m1.agentNom).toBe("BROUILLAT");
    expect(m1.jsLiberee.codeJs).toBe("AIG001");
    expect(m1.jsRepriseCodeJs).toBe("BAD001");

    // Niveau 2 : Leguay (libre) reprend AIG001 pour combler Brouillat
    expect(m2.niveau).toBe(2);
    expect(m2.agentNom).toBe("LEGUAY");
    expect(m2.jsRepriseCodeJs).toBe("AIG001");
  });

  it("le meilleur scénario sélectionné est Cascade (couverture 100 % vs Direct 0 %)", async () => {
    const result = await executerSimulationMultiJs([jsCible], agents, "all_agents");

    expect(result.scenarioMeilleur).not.toBeNull();
    expect(result.scenarioMeilleur!.tauxCouverture).toBe(100);
    // Le meilleur est l'un des deux scénarios Cascade
    expect(result.scenarioMeilleur!.titre).toMatch(/Cascade/);
  });

  it("scoring : Cascade pénalisé par les 2 maillons mais reste meilleur que les scénarios à 0 %", async () => {
    const result = await executerSimulationMultiJs([jsCible], agents, "all_agents");

    const cascade = result.scenarioTousAgentsCascade!;
    const direct  = result.scenarioTousAgents!;

    // La cascade marque malgré la pénalité maillon (4 × 2 = 8 pts)
    expect(cascade.score).toBeGreaterThan(direct.score);
    expect(cascade.score).toBeGreaterThan(0);
  });
});

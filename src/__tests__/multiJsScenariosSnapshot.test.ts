/**
 * Garde-fou de non-régression Phase 1 (mode Cascade).
 *
 * Ces tests figent la sortie des 4 scénarios pré-existants
 * (Réserve Direct, Réserve Figeage, Tous agents Direct, Tous agents Figeage)
 * sur un jeu de données déterministe.
 *
 * Quand on introduit les scénarios Cascade (Phase 3+), CES tests doivent
 * continuer à passer strictement : les 4 scénarios historiques ne doivent
 * pas voir leur affectation, statut, ou couverture changer.
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
  loadJsTypeFlexibiliteMap: jest.fn().mockResolvedValue(new Map([
    // GIV007 typée DERNIER_RECOURS pour activer le scénario Figeage
    ["GIV007", "DERNIER_RECOURS"],
  ])),
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

function makeJs(id: string, date: string, hd: string, hf: string, codeJs: string): JsCible {
  return {
    planningLigneId: id,
    agentId: "agent-source",
    agentNom: "Source",
    agentPrenom: "Agent",
    agentMatricule: "SRC",
    date,
    heureDebut: hd,
    heureFin: hf,
    amplitudeMin: 480,
    codeJs,
    typeJs: codeJs,
    isNuit: false,
    importId: "import-snap",
    flexibilite: "OBLIGATOIRE" as const,
  };
}

function makeAgent(
  id: string,
  overrides: Partial<AgentDataMultiJs["context"]> = {},
  events: PlanningEvent[] = []
): AgentDataMultiJs {
  return {
    context: {
      id,
      nom: `AGENT${id.toUpperCase()}`,
      prenom: "Test",
      matricule: `M-${id}`,
      posteAffectation: "P1",
      agentReserve: false,
      peutFaireNuit: true,
      peutEtreDeplace: true,
      regimeB: false,
      regimeC: false,
      prefixesJs: ["GIV"],
      lpaBaseId: null,
      ...overrides,
    },
    events,
  };
}

describe("Snapshot non-régression — 4 scénarios historiques", () => {
  it("structure : 6 scénarios en sortie (4 historiques + 2 Cascade)", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "06:00", "14:00", "GIV001");
    const a1 = makeAgent("a1", { agentReserve: true });

    const result = await executerSimulationMultiJs([js1], [a1], "all_agents");

    expect(result.scenarios).toHaveLength(6);
    expect(result.scenarioReserveOnly).not.toBeNull();
    expect(result.scenarioReserveOnlyFigeage).not.toBeNull();
    expect(result.scenarioTousAgents).not.toBeNull();
    expect(result.scenarioTousAgentsFigeage).not.toBeNull();
    expect(result.scenarioTousAgentsCascade).not.toBeNull();
    expect(result.scenarioTousAgentsCascadeFigeage).not.toBeNull();
  });

  it("titres et descriptions exacts des 6 scénarios", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "06:00", "14:00", "GIV001");
    const a1 = makeAgent("a1", { agentReserve: true });

    const result = await executerSimulationMultiJs([js1], [a1], "all_agents");

    expect(result.scenarioReserveOnly!.titre).toBe("Réserve — Direct");
    expect(result.scenarioReserveOnlyFigeage!.titre).toBe("Réserve + Figeage");
    expect(result.scenarioTousAgents!.titre).toBe("Tous agents — Direct");
    expect(result.scenarioTousAgentsFigeage!.titre).toBe("Tous agents + Figeage");
    expect(result.scenarioTousAgentsCascade!.titre).toBe("Tous agents — Cascade");
    expect(result.scenarioTousAgentsCascadeFigeage!.titre).toBe("Tous agents + Cascade + Figeage");
  });

  it("réserviste libre couvre la JS dans tous les scénarios → 100% partout", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "06:00", "14:00", "GIV001");
    // 1 réserviste libre, 1 agent simple libre
    const reserve = makeAgent("res", { agentReserve: true });
    const simple  = makeAgent("simple");

    const result = await executerSimulationMultiJs([js1], [reserve, simple], "all_agents");

    for (const sc of result.scenarios) {
      expect(sc.tauxCouverture).toBe(100);
      expect(sc.nbJsCouvertes).toBe(1);
      expect(sc.affectations).toHaveLength(1);
      // Tous les scénarios doivent privilégier le réserviste
      expect(sc.affectations[0].agentReserve).toBe(true);
    }
  });

  it("conflit horaire bloquant : Direct = 0%, Figeage si DERNIER_RECOURS = 100%", async () => {
    // JS cible le 2024-03-20 06:00→14:00
    const cible = makeJs("cible", "2024-03-20", "06:00", "14:00", "GIV001");
    // Réserviste occupé sur GIV007 (DERNIER_RECOURS) au même moment
    const conflit: PlanningEvent = {
      dateDebut: new Date("2024-03-20T06:00:00.000Z"),
      dateFin:   new Date("2024-03-20T14:00:00.000Z"),
      heureDebut: "06:00",
      heureFin:   "14:00",
      amplitudeMin: 480,
      dureeEffectiveMin: 480,
      jsNpo: "JS",
      codeJs: "GIV007",
      typeJs: "GIV007",
      planningLigneId: "ligne-conflit",
    };
    const reserve = makeAgent("res", { agentReserve: true }, [conflit]);

    const result = await executerSimulationMultiJs([cible], [reserve], "all_agents");

    // Sans figeage : aucun candidat car conflit horaire dur sur GIV007
    expect(result.scenarioReserveOnly!.tauxCouverture).toBe(0);
    expect(result.scenarioTousAgents!.tauxCouverture).toBe(0);
    // Avec figeage : GIV007 = DERNIER_RECOURS → libérable → 100%
    expect(result.scenarioReserveOnlyFigeage!.tauxCouverture).toBe(100);
    expect(result.scenarioTousAgentsFigeage!.tauxCouverture).toBe(100);
    // Et l'affectation porte bien la JS source figée
    const affAvecFigeage = result.scenarioReserveOnlyFigeage!.affectations[0];
    expect(affAvecFigeage.jsSourceFigee).not.toBeNull();
    expect(affAvecFigeage.jsSourceFigee!.codeJs).toBe("GIV007");
    // Et la chaîne de remplacement reste null sur les 4 scénarios historiques
    expect(affAvecFigeage.chaineRemplacement).toBeNull();
  });

  it("toutes les AffectationJs ont chaineRemplacement=null sur les 4 scénarios historiques", async () => {
    const js1 = makeJs("js-1", "2024-03-20", "06:00", "14:00", "GIV001");
    const a1 = makeAgent("a1", { agentReserve: true });

    const result = await executerSimulationMultiJs([js1], [a1], "all_agents");

    for (const sc of result.scenarios) {
      for (const aff of sc.affectations) {
        expect(aff.chaineRemplacement).toBeNull();
      }
    }
  });
});

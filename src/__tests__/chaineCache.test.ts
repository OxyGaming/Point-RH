import { buildCoverageIndex, findEligibleAgentsForJs } from "@/lib/simulation/multiJs/chaineCache";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";

function makeAgent(
  id: string,
  prefixesJs: string[],
  peutFaireNuit = true,
  peutEtreDeplace = false
): AgentDataMultiJs {
  return {
    context: {
      id,
      nom: `N${id}`,
      prenom: `P${id}`,
      matricule: `M${id}`,
      posteAffectation: null,
      agentReserve: false,
      peutFaireNuit,
      peutEtreDeplace,
      regimeB: false,
      regimeC: false,
      prefixesJs,
      lpaBaseId: null,
    },
    events: [],
  };
}

describe("buildCoverageIndex", () => {
  it("indexe les agents par préfixe (uppercase, trim)", () => {
    const agents = [
      makeAgent("a", ["GIC", " gic006r "]),
      makeAgent("b", ["BAD"]),
    ];
    const idx = buildCoverageIndex(agents);
    expect(idx.byPrefix.get("GIC")?.has("a")).toBe(true);
    expect(idx.byPrefix.get("GIC006R")?.has("a")).toBe(true);
    expect(idx.byPrefix.get("BAD")?.has("b")).toBe(true);
    expect(idx.byPrefix.get("BAD")?.has("a")).toBe(false);
  });

  it("ignore les préfixes vides", () => {
    const agents = [makeAgent("a", ["", "   ", "GIC"])];
    const idx = buildCoverageIndex(agents);
    expect(idx.byPrefix.size).toBe(1);
    expect(idx.byPrefix.has("GIC")).toBe(true);
  });

  it("alimente nightCapable et movable selon les flags", () => {
    const agents = [
      makeAgent("nuit-mob", ["GIC"], true, true),
      makeAgent("nuit-only", ["GIC"], true, false),
      makeAgent("mob-only", ["GIC"], false, true),
      makeAgent("ni-ni", ["GIC"], false, false),
    ];
    const idx = buildCoverageIndex(agents);
    expect(Array.from(idx.nightCapable).sort()).toEqual(["nuit-mob", "nuit-only"]);
    expect(Array.from(idx.movable).sort()).toEqual(["mob-only", "nuit-mob"]);
    expect(idx.allAgents.size).toBe(4);
  });
});

describe("findEligibleAgentsForJs", () => {
  const agents = [
    makeAgent("nuit-gic", ["GIC"], true, false),
    makeAgent("nuit-bad", ["BAD"], true, false),
    makeAgent("jour-gic", ["GIC"], false, false),
    makeAgent("nuit-mob-gic", ["GIC"], true, true),
  ];
  const idx = buildCoverageIndex(agents);

  it("filtre par préfixe : GIC006R retourne uniquement les agents habilités GIC", () => {
    const set = findEligibleAgentsForJs(idx, "GIC006R", false, false);
    expect(Array.from(set).sort()).toEqual(["jour-gic", "nuit-gic", "nuit-mob-gic"]);
  });

  it("filtre nuit : exclut les agents non habilités nuit", () => {
    const set = findEligibleAgentsForJs(idx, "GIC006R", true, false);
    expect(Array.from(set).sort()).toEqual(["nuit-gic", "nuit-mob-gic"]);
  });

  it("filtre déplacement : exclut les non-déplaçables", () => {
    const set = findEligibleAgentsForJs(idx, "GIC006R", true, true);
    expect(Array.from(set)).toEqual(["nuit-mob-gic"]);
  });

  it("codeJs null → tous les agents éligibles habilitations confondues", () => {
    const set = findEligibleAgentsForJs(idx, null, false, false);
    expect(set.size).toBe(4);
  });

  it("préfixe inexistant → set vide", () => {
    const set = findEligibleAgentsForJs(idx, "ZEB001", false, false);
    expect(set.size).toBe(0);
  });

  it("matche un préfixe exact (codeJs = préfixe)", () => {
    const set = findEligibleAgentsForJs(idx, "GIC", false, false);
    expect(set.size).toBe(3);
  });
});

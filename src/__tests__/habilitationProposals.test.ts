import {
  isCouvert,
  mergerHabilitations,
  computeAgentProposals,
  type CodeJsTenu,
} from "@/services/habilitation-proposals.service";

describe("isCouvert", () => {
  it("renvoie true quand un préfixe est préfixe strict du code", () => {
    expect(isCouvert("GIC015", ["GIC"])).toBe(true);
  });

  it("renvoie true quand un préfixe est exactement égal au code", () => {
    expect(isCouvert("GIC", ["GIC"])).toBe(true);
  });

  it("renvoie false quand aucun préfixe ne matche", () => {
    expect(isCouvert("GIC015", ["BAD", "PEY"])).toBe(false);
  });

  it("renvoie false avec une liste de préfixes vide", () => {
    expect(isCouvert("GIC015", [])).toBe(false);
  });

  it("renvoie false si le préfixe est plus long que le code", () => {
    expect(isCouvert("GIC", ["GIC015"])).toBe(false);
  });
});

describe("mergerHabilitations", () => {
  it("union dédoublonnée triée alphabétiquement", () => {
    expect(mergerHabilitations(["BAD", "GIC"], ["GIC", "PEY"])).toEqual([
      "BAD",
      "GIC",
      "PEY",
    ]);
  });

  it("conserve les habilitations actuelles si aucun ajout", () => {
    expect(mergerHabilitations(["GIC"], [])).toEqual(["GIC"]);
  });

  it("ignore les chaînes vides après trim", () => {
    expect(mergerHabilitations(["GIC"], ["  ", ""])).toEqual(["GIC"]);
  });

  it("trim chaque préfixe ajouté", () => {
    expect(mergerHabilitations([], [" GIC ", "BAD"])).toEqual(["BAD", "GIC"]);
  });
});

describe("computeAgentProposals", () => {
  const j = (iso: string) => new Date(iso);

  it("aucun codeJs tenu → aucune proposition", () => {
    expect(computeAgentProposals([], [])).toEqual([]);
  });

  it("agent sans habilitation + codes tenus → tous proposés", () => {
    const tenus: CodeJsTenu[] = [
      { codeJs: "GIC015", nbJoursTenus: 5, dernierJour: j("2026-04-10") },
      { codeJs: "BAD020", nbJoursTenus: 3, dernierJour: j("2026-04-12") },
    ];
    const res = computeAgentProposals([], tenus);
    expect(res).toEqual([
      { codeJs: "BAD020", nbJoursTenus: 3, dernierJour: j("2026-04-12") },
      { codeJs: "GIC015", nbJoursTenus: 5, dernierJour: j("2026-04-10") },
    ]);
  });

  it("préfixe large couvre code spécifique → pas de proposition", () => {
    const tenus: CodeJsTenu[] = [
      { codeJs: "GIC015", nbJoursTenus: 5, dernierJour: j("2026-04-10") },
    ];
    expect(computeAgentProposals(["GIC"], tenus)).toEqual([]);
  });

  it("préfixe actuel spécifique ne couvre pas un autre code → propose l'autre", () => {
    const tenus: CodeJsTenu[] = [
      { codeJs: "GIC015", nbJoursTenus: 3, dernierJour: j("2026-04-10") },
      { codeJs: "GIC020", nbJoursTenus: 2, dernierJour: j("2026-04-11") },
    ];
    expect(computeAgentProposals(["GIC015"], tenus)).toEqual([
      { codeJs: "GIC020", nbJoursTenus: 2, dernierJour: j("2026-04-11") },
    ]);
  });

  it("mix couvert / non couvert → ne propose que les non couverts", () => {
    const tenus: CodeJsTenu[] = [
      { codeJs: "GIC015", nbJoursTenus: 5, dernierJour: j("2026-04-10") },
      { codeJs: "BAD020", nbJoursTenus: 2, dernierJour: j("2026-04-12") },
    ];
    expect(computeAgentProposals(["GIC"], tenus)).toEqual([
      { codeJs: "BAD020", nbJoursTenus: 2, dernierJour: j("2026-04-12") },
    ]);
  });

  it("résultat trié par codeJs croissant", () => {
    const tenus: CodeJsTenu[] = [
      { codeJs: "ZEB001", nbJoursTenus: 1, dernierJour: j("2026-04-01") },
      { codeJs: "AAA001", nbJoursTenus: 1, dernierJour: j("2026-04-01") },
      { codeJs: "MMM001", nbJoursTenus: 1, dernierJour: j("2026-04-01") },
    ];
    const res = computeAgentProposals([], tenus);
    expect(res.map((p) => p.codeJs)).toEqual(["AAA001", "MMM001", "ZEB001"]);
  });
});
